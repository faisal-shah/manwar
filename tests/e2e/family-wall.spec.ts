import { expect, test, type Browser, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

/*
 * The wall as a family uses it on the first morning: a landscape Android
 * tablet driven by touch, from a household with real people in it.
 */

const NOW = 'now=2026-11-04T07:10';
const RUN = Date.now().toString(36);
let seq = 0;

test.describe.configure({ timeout: 90_000 });

const rail = (page: Page, label: string) => page.locator('.rail button', { hasText: label });

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents';
type Plain = string | number | boolean | null | Plain[] | { [k: string]: Plain };
const enc = (v: Plain): object =>
  v === null
    ? { nullValue: null }
    : typeof v === 'string'
      ? { stringValue: v }
      : typeof v === 'boolean'
        ? { booleanValue: v }
        : typeof v === 'number'
          ? { integerValue: String(v) }
          : Array.isArray(v)
            ? { arrayValue: { values: v.map(enc) } }
            : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
/** A document written straight into the emulator (the owner token bypasses the rules). */
async function seedDoc(name: string, collection: string, doc: { id: string } & Record<string, Plain>) {
  const res = await fetch(`${FIRESTORE}/households/demo-${name}/${collection}/${doc.id}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, x]) => [k, enc(x)])) }),
  });
  expect(res.ok).toBe(true);
}

/** A touch tablet (landscape, as Fully Kiosk shows it) on a fresh demo household. */
async function tablet(browser: Browser, extra = '') {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
    hasTouch: true,
    isMobile: true,
    timezoneId: 'America/Chicago',
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const name = `e2e-wall-${RUN}-${++seq}`;
  await page.goto(`/?demo=${name}&${NOW}${extra}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  /** A one-finger swipe from (x, y) by (dx, dy), in small steps as a finger moves. */
  const swipe = async (x: number, y: number, dx: number, dy: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 16; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + (dx * i) / 16, y: y + (dy * i) / 16, id: 1 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  return { ctx, page, cdp, name, swipe };
}

test('Tasks: an Up for Grabs column that appears opens on screen', async ({ browser }) => {
  const { ctx, page } = await tablet(browser);
  // The people arrive first, then their chores: Up for Grabs is put in front of the columns already shown.
  await rail(page, 'Tasks').click();
  await expect(page.locator('.pcols > .pcol')).toHaveCount(5, { timeout: 45_000 });
  await expect(page.locator('.pcols > .pcol').first()).toHaveAttribute('aria-label', 'Up for Grabs');
  await expect.poll(() => page.locator('.pcols').evaluate((el) => el.scrollLeft)).toBe(0);
  // Both chores claimed, the column goes; undoing a claim brings it back in front.
  for (const chore of ['Empty dishwasher', 'Take out trash']) {
    await page.getByRole('button', { name: `Complete ${chore}` }).click();
    await page.locator('.modal button', { hasText: 'Hashim!' }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  await expect(page.locator('.pcols > .pcol')).toHaveCount(4);
  await page.locator('.toast', { hasText: 'Take out trash' }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.pcols > .pcol').first()).toHaveAttribute('aria-label', 'Up for Grabs');
  await page.waitForTimeout(300);
  expect(await page.locator('.pcols').evaluate((el) => el.scrollLeft)).toBe(0);
  await ctx.close();
});

test('Tasks: a sideways swipe on the cards brings the next columns in', async ({ browser }) => {
  const { ctx, page, swipe } = await tablet(browser);
  await rail(page, 'Tasks').click();
  // Up for Grabs and four people: five columns, four on screen.
  await expect(page.locator('.pcols > .pcol')).toHaveCount(5, { timeout: 45_000 });
  const cols = page.locator('.pcols');
  await page.waitForTimeout(500);
  await cols.evaluate((el) => (el.scrollLeft = 0));
  // The swipe starts on a task card, where a finger lands, not on the column's header.
  const card = (await page.locator('.pcol .tk-card').nth(2).boundingBox())!;
  await swipe(card.x + card.width / 2, card.y + card.height / 2, -500, 0);
  await expect.poll(() => cols.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await ctx.close();
});

test('Tasks, Rewards and Home: a family of six sees the row of people continue past the edge', async ({ browser }) => {
  const { ctx, page, name } = await tablet(browser);
  await rail(page, 'Tasks').click();
  await expect(page.locator('.pcols > .pcol')).toHaveCount(5, { timeout: 45_000 });
  await seedDoc(name, 'profiles', { id: 'p5', name: 'Zaynab', color: '#7E5BA6', order: 10, stars: 0, createdAt: 10 });
  await seedDoc(name, 'profiles', { id: 'p6', name: 'Ibrahim', color: '#CE632D', order: 11, stars: 0, createdAt: 11 });
  /** How much of the first column past the row's edge shows, in rem, with the columns before it whole. */
  const peek = (row: string, col: string) =>
    page.locator(row).evaluate((el, col) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const edge = el.getBoundingClientRect().right;
      const cols = [...el.querySelectorAll(col)].map((c) => c.getBoundingClientRect());
      const cut = cols.findIndex((c) => c.right > edge + 0.5);
      return { whole: cut, shows: cut < 0 ? 0 : (edge - cols[cut].left) / rem };
    }, col);
  await expect(page.locator('.pcols > .pcol')).toHaveCount(7);
  await page.waitForTimeout(400);
  const tasks = await peek('.pcols', ':scope > .pcol');
  expect(tasks.whole).toBe(4);
  expect(tasks.shows).toBeGreaterThan(3);

  await rail(page, 'Rewards').click();
  await expect(page.locator('.pcols > .pcol')).toHaveCount(6);
  const rewards = await peek('.pcols', ':scope > .pcol');
  expect(rewards.whole).toBe(4);
  expect(rewards.shows).toBeGreaterThan(3);

  await rail(page, 'Home').click();
  await expect(page.locator('.tp-cards > .tp-card')).toHaveCount(7);
  const home = await peek('.tp-cards', ':scope > .tp-card');
  expect(home.whole).toBeGreaterThan(0);
  expect(home.shows).toBeGreaterThan(3);
  await ctx.close();
});

test('Tasks and Home: a household with people but no tasks yet is told how to add one', async ({ browser }) => {
  const { ctx, page, name } = await tablet(browser, '&seed=none');
  await seedDoc(name, 'profiles', { id: 'p1', name: 'Yusuf', color: '#FEB306', order: 0, stars: 0, createdAt: 1 });
  await rail(page, 'Tasks').click();
  await expect(page.locator('.pcol[aria-label="Yusuf"] .empty')).toContainText('No tasks yet. Tap + to add a routine or chore.');
  await rail(page, 'Home').click();
  await expect(page.locator('.tp-card[aria-label="Yusuf"] .tp-empty')).toContainText(
    'No tasks yet. Tap + to add a routine or chore.',
  );
  await page.screenshot({ path: test.info().outputPath('home.png') });
  await ctx.close();
});

test('Tasks: a kid cannot take back stars that were already spent', async ({ browser }) => {
  const { ctx, page, name } = await tablet(browser, '&seed=none');
  const salt = 'e2e-salt';
  const pinHash = createHash('sha256').update(`${salt}:1234`).digest('hex');
  await seedDoc(name, 'settings', { id: 'main', seededAt: 1, lock: { relockMinutes: 2, salt, pinHash } });
  await seedDoc(name, 'profiles', { id: 'p1', name: 'Maryam', color: '#F66850', order: 0, stars: 3, createdAt: 1 });
  const at = Date.UTC(2026, 10, 4, 13);
  const chore = (id: string, title: string, stars: number) =>
    seedDoc(name, 'tasks', {
      id,
      kind: 'chore',
      title,
      assignees: ['p1'],
      upForGrabs: false,
      stars,
      date: '2026-11-04',
      order: stars,
      createdAt: 1,
    });
  const done = (taskId: string, stars: number, ledgerId: string) =>
    seedDoc(name, 'taskStates', {
      id: `${taskId}_2026-11-04_x_p1`,
      taskId,
      date: '2026-11-04',
      part: null,
      profileId: 'p1',
      by: 'p1',
      status: 'done',
      at,
      stars,
      ledgerId,
    });
  const entry = (id: string, delta: number, reason: string, label: string) =>
    seedDoc(name, 'ledger', { id, profileId: 'p1', delta, reason, label, at });
  // 5 + 2 stars earned, 4 spent on a reward: 3 left.
  await chore('tA', 'Feed the cat', 5);
  await chore('tB', 'Tidy toys', 2);
  // One chore still open, so the column is not all done.
  await chore('tC', 'Water the plants', 1);
  await entry('l1', 5, 'task', 'Feed the cat');
  await entry('l2', 2, 'task', 'Tidy toys');
  await entry('l3', -4, 'redeem', 'Ice cream');
  await done('tA', 5, 'l1');
  await done('tB', 2, 'l2');

  await rail(page, 'Tasks').click();
  const col = page.locator('.pcol[aria-label="Maryam"]');
  const balance = col.locator('.star-pill');
  await expect(balance).toHaveText('3', { timeout: 30_000 });
  // Taking back 5 of the 3 stars left asks for the PIN, and Cancel leaves the task done.
  await col.getByRole('button', { name: 'Uncheck Feed the cat' }).click();
  const pad = page.locator('.modal', { has: page.locator('.pin-keys') });
  await expect(pad).toContainText('Those stars were spent');
  await pad.getByRole('button', { name: 'Cancel' }).click();
  await expect(pad).toHaveCount(0);
  await expect(col.getByRole('button', { name: 'Uncheck Feed the cat' })).toHaveAttribute('aria-pressed', 'true');
  await expect(balance).toHaveText('3');
  // Stars the balance still holds come back without it.
  await col.getByRole('button', { name: 'Uncheck Tidy toys' }).click();
  await expect(balance).toHaveText('1');
  await expect(page.locator('.modal .pin-keys')).toHaveCount(0);
  await ctx.close();
});

test('Tasks: a column of chores alone keeps its cards once all are done', async ({ browser }) => {
  const { ctx, page, name } = await tablet(browser, '&seed=none');
  await seedDoc(name, 'profiles', { id: 'p1', name: 'Yusuf', color: '#FEB306', order: 0, stars: 0, createdAt: 1 });
  await seedDoc(name, 'tasks', {
    id: 'tA',
    kind: 'chore',
    title: 'Feed the cat',
    assignees: ['p1'],
    upForGrabs: false,
    stars: 0,
    date: '2026-11-04',
    order: 1,
    createdAt: 1,
  });
  await rail(page, 'Tasks').click();
  const col = page.locator('.pcol[aria-label="Yusuf"]');
  await col.getByRole('button', { name: 'Complete Feed the cat' }).click();
  await expect(col.locator('.tk-alldone')).toBeVisible();
  // A mistaken check-off can still be undone after its toast is gone: the card is there to uncheck
  // (a moment later: a second tap at once is taken as the rest of a double tap).
  await page.waitForTimeout(700);
  await col.getByRole('button', { name: 'Uncheck Feed the cat' }).click();
  await expect(col.getByRole('button', { name: 'Complete Feed the cat' })).toBeVisible();
  await ctx.close();
});

test('Settings: three quick taps on one Move up button move that person up three places', async ({ browser }) => {
  const { ctx, page, name } = await tablet(browser, '&seed=none');
  for (const [i, n] of ['Baba', 'Mama', 'Alexandria', 'Maryam', 'Yusuf'].entries())
    await seedDoc(name, 'profiles', { id: `p${i}`, name: n, color: '#2177AE', order: i, stars: 0, createdAt: i });
  await rail(page, 'Settings').click();
  const names = page.locator('.profile-name');
  await expect(names).toHaveText(['Baba', 'Mama', 'Alexandria', 'Maryam', 'Yusuf'], { timeout: 30_000 });
  // A finger tapping where Yusuf's button was: after each move his row (and button) has gone up.
  await page.locator('.sheet').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const up = (await page.getByRole('button', { name: 'Move Yusuf up' }).boundingBox())!;
  for (let i = 0; i < 3; i++) {
    await page.touchscreen.tap(up.x + up.width / 2, up.y + up.height / 2);
    await page.waitForTimeout(250);
  }
  await expect(names).toHaveText(['Baba', 'Yusuf', 'Mama', 'Alexandria', 'Maryam']);
  await ctx.close();
});

test('Lists: three quick taps on one section arrow move that section up three places', async ({ browser }) => {
  const { ctx, page, name } = await tablet(browser, '&seed=none');
  const sections = ['Produce', 'Dairy', 'Pantry', 'Frozen'].map((n, i) => ({ id: `s${i}`, name: n }));
  await seedDoc(name, 'lists', { id: 'l1', title: 'Costco', kind: 'todo', sections, order: 5, createdAt: 1 });
  await rail(page, 'Lists').click();
  await page.getByRole('button', { name: 'Costco menu' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Edit list' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit list' });
  const order = () => editor.locator('.section-row input').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  await expect.poll(order).toEqual(['Produce', 'Dairy', 'Pantry', 'Frozen']);
  await editor.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const up = (await editor.getByRole('button', { name: 'Move Frozen up' }).boundingBox())!;
  for (let i = 0; i < 3; i++) {
    await page.touchscreen.tap(up.x + up.width / 2, up.y + up.height / 2);
    await page.waitForTimeout(250);
  }
  await expect.poll(order).toEqual(['Frozen', 'Produce', 'Dairy', 'Pantry']);
  await ctx.close();
});
