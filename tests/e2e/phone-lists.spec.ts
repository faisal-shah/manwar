import { createHash } from 'node:crypto';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { FS, OWNER, pairPhone, phone, wall } from './phone-helpers';

/*
 * The phone's Lists tab against demo households (emulators), with the wall
 * open beside it where the two must agree. Each test has its own household.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 90_000 });
const RUN = Date.now().toString(36);
const name = (n: string) => `phlists-${RUN}-${n}`;

type Plain = string | number | boolean | Plain[] | { [k: string]: Plain };
const enc = (v: Plain): object =>
  typeof v === 'string'
    ? { stringValue: v }
    : typeof v === 'boolean'
      ? { booleanValue: v }
      : typeof v === 'number'
        ? { integerValue: String(v) }
        : Array.isArray(v)
          ? { arrayValue: { values: v.map(enc) } }
          : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };

/**
 * Write documents straight into a household (the owner token passes the
 * rules), in one commit; only the fields given, so a document already there
 * keeps the rest.
 */
async function seed(household: string, docs: { collection: string; id: string; fields: Record<string, Plain> }[]) {
  const root = 'projects/demo-manwar/databases/(default)/documents';
  const res = await fetch(`${FS}:commit`, {
    method: 'POST',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: docs.map((d) => ({
        update: {
          name: `${root}/households/demo-${household}/${d.collection}/${d.id}`,
          // The app reads a document's id from its data, as it writes it.
          fields: Object.fromEntries(Object.entries({ id: d.id, ...d.fields }).map(([k, x]) => [k, enc(x)])),
        },
        updateMask: { fieldPaths: ['id', ...Object.keys(d.fields)] },
      })),
    }),
  });
  expect(res.ok, await res.text()).toBe(true);
}

/** The parent PIN 1234, as core/lock.ts stores it. */
async function setPin(household: string) {
  const salt = 'e2e-salt';
  const pinHash = createHash('sha256').update(`${salt}:1234`).digest('hex');
  await seed(household, [
    { collection: 'settings', id: 'main', fields: { seededAt: 1, lock: { relockMinutes: 2, salt, pinHash } } },
  ]);
}

const openLists = (p: Page) => p.locator('.ph-nav').getByRole('button', { name: 'Lists' }).click();
/**
 * A view drops a tap that comes within the double-tap time of the one that
 * opened it, near the same spot (useOpeningGuard): wait that out, as a
 * person always does.
 */
const settleOpen = (p: Page) => p.waitForTimeout(500);
async function openList(p: Page, title: string) {
  await openLists(p);
  await p.locator('.phl-row', { hasText: title }).click();
  await expect(p.locator('.ph-head h1')).toContainText(title);
  await settleOpen(p);
}
const phoneRow = (p: Page, text: string | RegExp) => p.locator('.phl-card .li-row', { hasText: text });
const wallCard = (w: Page, title: string) => w.locator('.list-card', { has: w.locator('.lc-title', { hasText: title }) });
async function wallLists(w: Page) {
  await w.locator('.rail button', { hasText: 'Lists' }).click();
}
/** Playwright's goBack targets an entry: let the page's own history.back() land first (CLAUDE.md, Back gesture). */
async function back(p: Page, depth: number) {
  await expect.poll(() => p.evaluate(() => (history.state as { manwarBack?: number } | null)?.manwarBack ?? 0)).toBe(depth);
  await p.goBack();
}

test('items added on the phone show on the wall, one after another with the field kept', async ({ browser }) => {
  const hh = name('add');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  const field = p.page.getByLabel('Add item to Grocery List');
  await field.click();
  await field.fill('2 gal apple juice');
  await field.press('Enter');
  // The field stays focused and empty: the next item goes straight in.
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('enterkeyhint', 'enter');
  await p.page.keyboard.type('Sourdough');
  await p.page.keyboard.press('Enter');
  await expect(phoneRow(p.page, 'Apple juice').locator('.li-qty')).toHaveText('2 gal');
  await expect(phoneRow(p.page, 'Sourdough')).toBeVisible();

  await wallLists(w.page);
  const card = wallCard(w.page, 'Grocery List');
  await expect(card.locator('.li-row', { hasText: 'Apple juice' }).locator('.li-qty')).toHaveText('2 gal');
  await expect(card.locator('.li-row', { hasText: 'Sourdough' })).toBeVisible();

  // Checked off on the phone, checked on the wall; and back.
  await phoneRow(p.page, 'Sourdough').getByRole('checkbox').click();
  await expect(card.locator('.li-row', { hasText: 'Sourdough' }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  await card.locator('.li-row', { hasText: 'Sourdough' }).getByRole('checkbox').click();
  await expect(phoneRow(p.page, 'Sourdough').getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('the same item rules as the wall: no duplicate, a done one comes back', async ({ browser }) => {
  const hh = name('dupes');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  const field = p.page.getByLabel('Add item to Grocery List');
  await field.fill('bananas');
  await field.press('Enter');
  await expect(p.page.locator('.toast')).toContainText('Bananas is already on Grocery List.');
  await expect(phoneRow(p.page, /bananas/i)).toHaveCount(1);
  // Olive oil is checked off in the demo: typing it brings it back unchecked.
  await field.fill('• Olive oil');
  await field.press('Enter');
  await expect(phoneRow(p.page, /olive oil/i)).toHaveCount(1);
  await expect(phoneRow(p.page, /olive oil/i).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  expect(p.errors).toEqual([]);
});

test('two phones adding the same item at the same moment make one item', async ({ browser }) => {
  const hh = name('twophones');
  const w = await wall(browser, hh);
  const a = await phone(browser, hh);
  const b = await phone(browser, hh);
  await openList(a.page, 'Grocery List');
  await openList(b.page, 'Grocery List');
  const fa = a.page.getByLabel('Add item to Grocery List');
  const fb = b.page.getByLabel('Add item to Grocery List');
  await fa.fill('Paper towels');
  await fb.fill('paper towel');
  // Both before either hears of the other.
  await Promise.all([fa.press('Enter'), fb.press('Enter')]);
  await wallLists(w.page);
  const card = wallCard(w.page, 'Grocery List');
  await expect(card.locator('.li-row', { hasText: /paper towel/i })).toHaveCount(1);
  // Give any second copy time to arrive before counting on the phones.
  await w.page.waitForTimeout(1500);
  await expect(card.locator('.li-row', { hasText: /paper towel/i })).toHaveCount(1);
  await expect(phoneRow(a.page, /paper towel/i)).toHaveCount(1);
  await expect(phoneRow(b.page, /paper towel/i)).toHaveCount(1);
  expect([...w.errors, ...a.errors, ...b.errors]).toEqual([]);
});

test('Clear done removes the done items everywhere, and Undo brings them back', async ({ browser }) => {
  const hh = name('clear');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  await phoneRow(p.page, 'Bananas').getByRole('checkbox').click();
  await phoneRow(p.page, 'Spinach').getByRole('checkbox').click();
  const doneGroup = p.page.locator('.phl-card .ls-group', { has: p.page.locator('.done-head') });
  await expect(doneGroup.locator('.li-row')).toHaveCount(3);
  await p.page.getByRole('button', { name: 'Grocery List menu' }).click();
  await p.page.locator('.popover .menu').getByRole('button', { name: 'Clear done (3)' }).click();
  await expect(doneGroup).toHaveCount(0);
  await wallLists(w.page);
  const card = wallCard(w.page, 'Grocery List');
  await expect(card.locator('.li-row', { hasText: 'Bananas' })).toHaveCount(0);
  await p.page.locator('.toast', { hasText: 'Cleared 3 done items' }).getByRole('button', { name: 'Undo' }).click();
  await expect(doneGroup.locator('.li-row')).toHaveCount(3);
  await expect(card.locator('.li-row', { hasText: 'Bananas' }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  // Shopping mode: the done items hide, and show again.
  await p.page.getByRole('button', { name: 'Grocery List menu' }).click();
  await p.page.locator('.popover .menu').getByRole('button', { name: 'Hide done items' }).click();
  await expect(doneGroup.locator('.li-row')).toHaveCount(0);
  await expect(doneGroup.locator('.ls-count')).toHaveText('3');
  await p.page.getByRole('button', { name: 'Grocery List menu' }).click();
  await p.page.locator('.popover .menu').getByRole('button', { name: 'Show done items' }).click();
  await expect(doneGroup.locator('.li-row')).toHaveCount(3);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a list deleted on the wall closes on the phone, with one word of why', async ({ browser }) => {
  const hh = name('deleted');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Camping packing');
  // Its editor open on the phone too.
  await p.page.getByRole('button', { name: 'Camping packing menu' }).click();
  await p.page.locator('.popover .menu').getByRole('button', { name: 'Edit list' }).click();
  await expect(p.page.getByRole('dialog', { name: 'Edit list' })).toBeVisible();
  await wallLists(w.page);
  await w.page.getByRole('button', { name: 'Camping packing menu' }).click();
  await w.page.locator('.popover .menu').getByRole('button', { name: 'Delete list' }).click();
  await w.page.getByRole('dialog', { name: 'Delete Camping packing?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(p.page.getByRole('dialog', { name: 'Edit list' })).toHaveCount(0);
  await expect(p.page.locator('.ph-head h1')).toHaveText('Lists');
  await expect(p.page.locator('.phl-row', { hasText: 'Camping packing' })).toHaveCount(0);
  await expect(p.page.locator('.toast', { hasText: 'Camping packing was deleted on another device.' })).toHaveCount(1);
  // Back now leaves Lists for Today: the closed views gave their entries back.
  await back(p.page, 1);
  await expect(p.page.locator('.ph-head h1')).toHaveText('Today');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a list deleted on the wall while the phone shows another tab is closed on coming back', async ({ browser }) => {
  const hh = name('deltab');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'To Do');
  await p.page.locator('.ph-nav').getByRole('button', { name: 'Today' }).click();
  await wallLists(w.page);
  await w.page.getByRole('button', { name: 'To Do menu' }).click();
  await w.page.locator('.popover .menu').getByRole('button', { name: 'Delete list' }).click();
  await w.page.getByRole('dialog', { name: 'Delete To Do?' }).getByRole('button', { name: 'Delete' }).click();
  // Gone on the server, and heard on the phone, before it comes back to Lists.
  await expect
    .poll(async () => (await fetch(`${FS}/households/demo-${hh}/lists`, { headers: OWNER })).text())
    .not.toContain('"To Do"');
  await p.page.waitForTimeout(1500);
  await openLists(p.page);
  await expect(p.page.locator('.ph-head h1')).toHaveText('Lists');
  await expect(p.page.locator('.ph-back')).toHaveCount(0);
  await expect(p.page.locator('.toast', { hasText: 'To Do was deleted on another device.' })).toBeVisible();
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a double tap on a list opens it without checking, focusing or asking anything', async ({ browser }) => {
  const hh = name('doubletap');
  await wall(browser, hh);
  await setPin(hh);
  const p = await phone(browser, hh);
  await openLists(p.page);
  const row = p.page.locator('.phl-row', { hasText: 'Grocery List' });
  const b = (await row.boundingBox())!;
  // Where the second tap lands in the open list: the Add item field (and, at the right, a check box below it).
  for (const x of [b.x + 60, b.x + b.width - 30]) {
    await p.page.mouse.click(x, b.y + b.height - 8);
    await p.page.waitForTimeout(120);
    await p.page.mouse.click(x, b.y + b.height - 8);
    await expect(p.page.locator('.ph-head h1')).toContainText('Grocery List');
    await p.page.waitForTimeout(600);
    await expect(p.page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);
    await expect(p.page.getByLabel('Add item to Grocery List')).not.toBeFocused();
    await expect(p.page.locator('.phl-card .li-row.checked')).toHaveCount(1);
    await p.page.locator('.ph-back').click();
    await expect(p.page.locator('.ph-head h1')).toHaveText('Lists');
  }
  expect(p.errors).toEqual([]);
});

test('a double tap on a menu item closes the menu without pressing the row under it', async ({ browser }) => {
  const hh = name('closetap');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  for (const label of ['Hide done items', 'Show done items']) {
    await p.page.getByRole('button', { name: 'Grocery List menu' }).click();
    const item = p.page.locator('.popover .menu').getByRole('button', { name: label });
    await expect(item).toBeVisible();
    await p.page.waitForTimeout(500);
    // At the right, where the rows under the menu have their check boxes.
    const b = (await item.boundingBox())!;
    const x = b.x + b.width - 30;
    const y = b.y + b.height / 2;
    await p.page.mouse.click(x, y);
    await p.page.waitForTimeout(120);
    await p.page.mouse.click(x, y);
    await p.page.waitForTimeout(700);
    await expect(p.page.locator('.popover')).toHaveCount(0);
    // Only Olive oil (checked in the demo) is checked, and it shows only when done items do.
    await expect(p.page.locator('.phl-card .li-row.checked')).toHaveCount(label === 'Hide done items' ? 0 : 1);
    await expect(p.page.locator('.phl-card .ls-group .done-head .ls-count')).toHaveText('1');
  }
  expect(p.errors).toEqual([]);
});

test('a list deleted on the phone closes without a word about another device', async ({ browser }) => {
  const hh = name('delhere');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'To Do');
  await p.page.getByRole('button', { name: 'To Do menu' }).click();
  await p.page.locator('.popover .menu').getByRole('button', { name: 'Delete list' }).click();
  await p.page.getByRole('dialog', { name: 'Delete To Do?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(p.page.locator('.ph-head h1')).toHaveText('Lists');
  await expect(p.page.locator('.toast')).toHaveText('Deleted To Do');
  expect(p.errors).toEqual([]);
});

test('a new list made on the phone opens, ready for its first item', async ({ browser }) => {
  const hh = name('newlist');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await openLists(p.page);
  await p.page.getByRole('button', { name: 'New list' }).first().click();
  const sheet = p.page.getByRole('dialog', { name: 'New list' });
  await sheet.getByLabel('Title').fill('Hardware store');
  await p.page.waitForTimeout(500);
  await sheet.getByRole('button', { name: 'Add list' }).click();
  await expect(p.page.locator('.ph-head h1')).toHaveText('Hardware store');
  await p.page.getByLabel('Add item to Hardware store').fill('Wood glue');
  await p.page.getByLabel('Add item to Hardware store').press('Enter');
  await wallLists(w.page);
  await expect(wallCard(w.page, 'Hardware store').locator('.li-row', { hasText: 'Wood glue' })).toBeVisible();
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test("the phone's Back closes the item editor, then the list, then Lists", async ({ browser }) => {
  const hh = name('back');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  await phoneRow(p.page, 'Milk').locator('.li-text').click();
  const editor = p.page.locator('.popover .item-editor');
  await expect(editor).toBeVisible();
  await back(p.page, 3);
  await expect(editor).toHaveCount(0);
  await expect(p.page.locator('.ph-head h1')).toContainText('Grocery List');
  await back(p.page, 2);
  await expect(p.page.locator('.ph-head h1')).toHaveText('Lists');
  await back(p.page, 1);
  await expect(p.page.locator('.ph-head h1')).toHaveText('Today');
  expect(p.errors).toEqual([]);
});

test('after a reload with a list open, Back still steps through the views', async ({ browser }) => {
  const hh = name('reload');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  await p.page.reload();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  // The entries the last page pushed are given up, and the new ones made after that.
  await openList(p.page, 'Grocery List');
  await back(p.page, 2);
  await expect(p.page.locator('.ph-head h1')).toHaveText('Lists');
  await back(p.page, 1);
  await expect(p.page.locator('.ph-head h1')).toHaveText('Today');
  expect(p.errors).toEqual([]);
});

test('writes made offline on the phone reach the wall once it is back online', async ({ browser }) => {
  const hh = name('offline');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  await p.page.context().setOffline(true);
  const field = p.page.getByLabel('Add item to Grocery List');
  await field.fill('Batteries');
  await field.press('Enter');
  await phoneRow(p.page, 'Yogurt').getByRole('checkbox').click();
  await expect(phoneRow(p.page, 'Batteries')).toBeVisible();
  await wallLists(w.page);
  const card = wallCard(w.page, 'Grocery List');
  await w.page.waitForTimeout(1500);
  await expect(card.locator('.li-row', { hasText: 'Batteries' })).toHaveCount(0);
  await p.page.context().setOffline(false);
  await expect(card.locator('.li-row', { hasText: 'Batteries' })).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('.li-row', { hasText: 'Yogurt' }).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  expect(w.errors).toEqual([]);
});

test('a phone signed in as the wall asks for the PIN before adding; a paired phone never does', async ({ browser }) => {
  const hh = name('pin');
  const w = await wall(browser, hh);
  const paired = await pairPhone(browser, w.page, hh);
  await setPin(hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  await p.page.getByLabel('Add item to Grocery List').click();
  const pad = p.page.getByRole('dialog', { name: 'Parent PIN' });
  await expect(pad).toBeVisible();
  // The pad fits the phone: every key inside the screen.
  for (const k of ['1', '2', '3', '4', '0', 'Delete'])
    await expect(pad.getByRole('button', { name: k, exact: true })).toBeInViewport();
  for (const d of '1234') await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(pad).toHaveCount(0);
  await expect(p.page.getByLabel('Add item to Grocery List')).toBeFocused();
  await p.page.keyboard.type('Rice flour');
  await p.page.keyboard.press('Enter');
  await expect(phoneRow(p.page, 'Rice flour')).toBeVisible();

  await openList(paired.page, 'Grocery List');
  const field = paired.page.getByLabel('Add item to Grocery List');
  await field.click();
  await field.fill('Lentils');
  await field.press('Enter');
  await expect(phoneRow(paired.page, 'Lentils')).toBeVisible();
  await phoneRow(paired.page, 'Lentils').locator('.li-text').click();
  await expect(paired.page.locator('.popover .item-editor')).toBeVisible();
  await expect(paired.page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);
  expect([...w.errors, ...p.errors, ...paired.errors]).toEqual([]);
});

test('opening a list raises no keyboard and asks for no PIN, on the phone or the wall', async ({ browser }) => {
  const hh = name('nofocus');
  const w = await wall(browser, hh);
  await setPin(hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  await p.page.waitForTimeout(800);
  await expect(p.page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);
  await expect(p.page.getByLabel('Add item to Grocery List')).not.toBeFocused();
  await wallLists(w.page);
  await w.page.waitForTimeout(800);
  await expect(w.page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);
  expect(await w.page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a long list scrolls under the Add item field, which stays on top, and reveals what was added', async ({ browser }) => {
  const hh = name('long');
  const items = Array.from({ length: 200 }, (_, i) => ({
    collection: 'listItems',
    id: `i${String(i).padStart(3, '0')}`,
    fields: { listId: 'long', text: `Item number ${i + 1}`, done: i % 10 === 9, order: i, createdAt: 1 } as Record<string, Plain>,
  }));
  await seed(hh, [
    { collection: 'settings', id: 'main', fields: { seededAt: 1 } },
    { collection: 'lists', id: 'long', fields: { title: 'Big shop', kind: 'grocery', sections: [], order: 0, createdAt: 1 } },
    ...items,
  ]);
  const p = await phone(browser, hh);
  await openList(p.page, 'Big shop');
  await expect(p.page.locator('.phl-card .li-row')).toHaveCount(200);
  const body = p.page.locator('.phl-card .lc-body');
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const field = p.page.getByLabel('Add item to Big shop');
  await expect(field).toBeInViewport();
  await expect(phoneRow(p.page, 'Item number 200')).toBeInViewport();
  await field.fill('Item number 5');
  await field.press('Enter');
  // Already on it: the list scrolls to it.
  await expect(phoneRow(p.page, 'Item number 5').first()).toBeInViewport();
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await field.fill('Cardamom');
  await field.press('Enter');
  await expect(phoneRow(p.page, 'Cardamom')).toBeInViewport();
  // No sideways scroll of the page.
  expect(await p.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(p.errors).toEqual([]);
});

test('with the keyboard up (a shorter page) the field and the item just added stay in view', async ({ browser }) => {
  const hh = name('keyboard');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  const field = p.page.getByLabel('Add item to Grocery List');
  await field.click();
  await p.page.setViewportSize({ width: 412, height: 470 });
  await expect(field).toBeInViewport({ ratio: 1 });
  await field.fill('Saffron');
  await field.press('Enter');
  await expect(phoneRow(p.page, 'Saffron')).toBeInViewport({ ratio: 1 });
  await expect(field).toBeFocused();
  // Landscape: nothing runs off the side.
  await p.page.setViewportSize({ width: 915, height: 412 });
  await expect(field).toBeInViewport({ ratio: 1 });
  expect(await p.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(p.errors).toEqual([]);
});

test('Arabic items and titles keep their direction on the phone', async ({ browser }) => {
  const hh = name('arabic');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await openList(p.page, 'Grocery List');
  const field = p.page.getByLabel('Add item to Grocery List');
  await field.fill('حليب');
  await field.press('Enter');
  const row = phoneRow(p.page, 'حليب');
  await expect(row.locator('bdi')).toHaveText('حليب');
  await back(p.page, 2);
  const sub = p.page.locator('.phl-row', { hasText: 'Grocery List' }).locator('small');
  await expect(sub).toHaveAttribute('dir', 'auto');
  await expect(sub).toContainText('حليب');
  expect(p.errors).toEqual([]);
});
