import { expect as baseExpect, devices, test, type Page } from '@playwright/test';
import { newContext, phone, wall } from './phone-helpers';
import { RUN, writeDoc } from './phone-family';

/*
 * The wall's sheets, dialogs and popovers as the phone shows them: modal
 * for focus, above an on-screen keyboard that does not resize the page
 * (Safari on iPhone), and family text in its own direction.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });
const name = (n: string) => `phover-${RUN}-${n}`;

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

const tab = (p: Page, label: string) => p.locator('.ph-nav').getByRole('button', { name: label });
const depth = (p: Page, n: number) =>
  expect.poll(() => p.evaluate(() => Number((history.state as { manwarBack?: number } | null)?.manwarBack ?? 0))).toBe(n);
/** What has focus: inside a dialog (its label), or the element's own description. */
const focused = (p: Page) =>
  p.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return 'body';
    const d = a.closest('[role="dialog"]');
    return d
      ? `in dialog ${d.getAttribute('aria-label')}`
      : `${a.tagName.toLowerCase()}.${a.className} ${a.getAttribute('aria-label') ?? ''}`.trim();
  });

test('on the phone an overlay takes focus, leaves a field that focuses itself alone, and gives focus back', async ({
  browser,
}) => {
  const hh = name('focus');
  const w = await wall(browser, hh);
  await expect(w.page.locator('.rail .badge')).toHaveText('3', { timeout: 30_000 });
  const { page: p, errors } = await phone(browser, hh);

  // Task details: modal, named by the task, focused; Back gives focus to the card that opened it.
  await tab(p, 'Tasks').click();
  const opener = p.locator('.pt .tk-card[data-task="Breakfast"] .tk-body');
  await opener.click();
  const details = p.getByRole('dialog', { name: 'Breakfast' });
  await expect(details).toHaveAttribute('aria-modal', 'true');
  await expect.poll(() => focused(p)).toBe('in dialog Breakfast');
  await depth(p, 2);
  await p.goBack();
  await expect(details).toHaveCount(0);
  await expect(opener).toBeFocused();

  // A new event: its title field focuses itself and keeps focus (the keyboard stays up); Close gives it back.
  await tab(p, 'Calendar').click();
  await expect(p.locator('.phc-day').first()).toBeVisible();
  const add = p.getByRole('button', { name: 'Add event' });
  await add.click();
  const title = p.locator('.sheet input[name="title"]');
  await expect(title).toBeFocused();
  // Past the double-tap time too: the editor's X is where the header's + was.
  await p.waitForTimeout(600);
  await expect(title).toBeFocused();
  await expect(p.locator('.sheet')).toHaveAttribute('aria-modal', 'true');
  await p.locator('.sheet').getByRole('button', { name: 'Close' }).click();
  await expect(p.locator('.sheet')).toHaveCount(0);
  await expect(add).toBeFocused();

  // Event details, named by the event; Back gives focus to its row.
  const row = p.locator('.phc-ev').first();
  const event = (await row.locator('.phc-ev-title, .phc-ev-text').first().textContent())!.trim();
  await row.click();
  await expect(p.getByRole('dialog', { name: event })).toBeVisible();
  await expect.poll(() => focused(p)).toBe(`in dialog ${event}`);
  await depth(p, 2);
  await p.goBack();
  await expect(p.locator('.ev-detail')).toHaveCount(0);
  await expect(row).toBeFocused();
  expect([...w.errors, ...errors]).toEqual([]);
});

test("the wall's overlays leave focus where it is and are not marked modal", async ({ browser }) => {
  const hh = name('wallfocus');
  const { page: w, errors } = await wall(browser, hh);
  await w.locator('.rail button', { hasText: 'Tasks' }).click();
  const opener = w.locator('[data-column="asiyah"] .tk-card[data-task="Breakfast"] .tk-body');
  await opener.click();
  const details = w.getByTestId('task-details');
  await expect(details).toBeVisible();
  await w.waitForTimeout(300);
  await expect(w.locator('.popover')).not.toHaveAttribute('aria-modal', /.*/);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

/**
 * Safari on iPhone: the keyboard shrinks only the visual viewport, never the
 * page. A stand-in visualViewport the test drives, before the app starts.
 */
const SAFARI_KEYBOARD = `(() => {
  const vv = new EventTarget();
  let kb = 0;
  for (const [k, get] of Object.entries({
    height: () => innerHeight - kb, width: () => innerWidth, offsetTop: () => 0, offsetLeft: () => 0,
    pageTop: () => 0, pageLeft: () => 0, scale: () => 1,
  })) Object.defineProperty(vv, k, { get });
  Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
  window.__keyboard = (px) => { kb = px; vv.dispatchEvent(new Event('resize')); };
})()`;

test('with a keyboard that leaves the page its height, the sheet ends above it with the field and Add in view', async ({
  browser,
}) => {
  const hh = name('safari');
  const w = await wall(browser, hh);
  await expect(w.page.locator('.rail .badge')).toHaveText('3', { timeout: 30_000 });
  const ctx = await newContext(browser, { ...devices['iPhone 13'], timezoneId: 'America/Chicago' });
  await ctx.addInitScript(SAFARI_KEYBOARD);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(`/?demo=${hh}&layout=phone&now=2026-11-04T11:44`);
  await tab(p, 'Calendar').click();
  await expect(p.locator('.phc-day').first()).toBeVisible();
  await p.getByRole('button', { name: 'Add event' }).click();
  const sheet = p.locator('.sheet');
  const notes = sheet.locator('textarea[name="notes"]');
  // Notes low on the screen, then tapped.
  await sheet.locator('.sheet-body').evaluate((body) => {
    const field = body.querySelector('textarea')!;
    body.scrollTop += field.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 4;
  });
  await p.waitForTimeout(500);
  await notes.click();
  const full = p.viewportSize()!.height;
  const kb = Math.round(full * 0.42);
  await p.evaluate((px) => (window as unknown as { __keyboard: (n: number) => void }).__keyboard(px), kb);
  await p.waitForTimeout(400);
  const above = full - kb;
  const save = (await sheet.getByRole('button', { name: 'Add', exact: true }).boundingBox())!;
  expect(save.y + save.height).toBeLessThanOrEqual(above + 0.5);
  const box = (await notes.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + 30).toBeLessThanOrEqual(above);
  await expect(notes).toBeFocused();
  // The tab bar is above it too, as when the page resizes; and all of it comes back when the keyboard goes.
  expect((await p.locator('.ph-nav').boundingBox())!.y + 1).toBeLessThanOrEqual(above);
  await p.evaluate(() => (window as unknown as { __keyboard: (n: number) => void }).__keyboard(0));
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.height)).toBe(full);
  expect([...w.errors, ...errors]).toEqual([]);
});

test('Arabic in a meal’s card and the redeemed dialog keeps its direction', async ({ browser }) => {
  const hh = name('arabic');
  const w = await wall(browser, hh);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column="asiyah"] .star-pill')).toHaveText('128', { timeout: 30_000 });
  const meal = '٢ كوب شاي!';
  const reward = 'رحلة إلى الحديقة!';
  const person = 'عائشة';
  await writeDoc(hh, 'meals/m-ar', {
    id: { stringValue: 'm-ar' },
    date: { stringValue: '2026-11-05' },
    category: { stringValue: 'dinner' },
    title: { stringValue: meal },
    order: { integerValue: '9' },
    createdAt: { integerValue: '1' },
  });
  await writeDoc(hh, 'profiles/p6', {
    id: { stringValue: 'p6' },
    name: { stringValue: person },
    color: { stringValue: '#8E4C9E' },
    order: { integerValue: '11' },
    stars: { integerValue: '12' },
    createdAt: { integerValue: '2' },
  });
  await writeDoc(hh, 'rewards/r-ar', {
    id: { stringValue: 'r-ar' },
    title: { stringValue: reward },
    cost: { integerValue: '1' },
    profiles: { arrayValue: {} },
    renews: { booleanValue: true },
    redeemedBy: { mapValue: { fields: {} } },
    order: { integerValue: '9' },
    createdAt: { integerValue: '1' },
  });
  const { page: p, errors } = await phone(browser, hh);
  await tab(p, 'More').click();
  await p.locator('.ph-menu button', { hasText: 'Meals' }).click();
  await p.waitForTimeout(500);
  await p.locator('.pm-meal', { hasText: meal }).click();
  const card = p.locator('.popover:has(.meal-pop)');
  await expect(card.locator('.mp-title bdi')).toHaveText(meal);
  await depth(p, 3);
  await p.goBack();
  await expect(card).toHaveCount(0);
  await depth(p, 2);
  await p.goBack();
  await p.locator('.ph-menu button', { hasText: 'Stars and rewards' }).click();
  await p.waitForTimeout(500);
  await p.locator('.psv-person[data-person="p6"]').click();
  await p.waitForTimeout(500);
  await p.locator(`.ps-reward[data-reward="${reward}"] .ps-redeem`).click();
  const done = p.getByRole('dialog', { name: 'Reward redeemed' });
  await expect(done.locator('h2 bdi')).toHaveText(reward);
  await expect(done.locator('p bdi')).toHaveText(person);
  expect([...w.errors, ...errors]).toEqual([]);
});
