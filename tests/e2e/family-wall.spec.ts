import { expect, test, type Browser, type Page } from '@playwright/test';

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
type Plain = string | number | boolean;
const enc = (v: Plain) =>
  typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { integerValue: String(v) };
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
