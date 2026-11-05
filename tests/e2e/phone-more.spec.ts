import { expect as baseExpect, test, type Page } from '@playwright/test';
import { FS, newContext, OWNER, phone, wall } from './phone-helpers';

/*
 * The phone's More rows that act on the wall: a note, the timer, the screen,
 * and the meal plan. Each test opens the wall and a phone on its own demo
 * household and checks both sides.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 90_000 });
const RUN = Date.now().toString(36);
const name = (n: string) => `phmore-${RUN}-${n}`;

// Every wall and phone a test opened is its own browser context: close them, or a worker holds them all.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

async function more(p: Page, row: string) {
  await p.locator('.ph-nav').getByRole('button', { name: 'More' }).click();
  if (await p.locator('.ph-back').count()) await p.locator('.ph-back').click();
  await p.locator('.ph-menu button', { hasText: row }).click();
  await expect(p.locator('.ph-head h1')).toHaveText(row);
  // The view drops a tap within the double-tap time of the one that opened it, near that spot (useOpeningTapGuard).
  await p.waitForTimeout(500);
}
/** Playwright's goBack targets an entry: let the page's own history.back() land first (CLAUDE.md, Back gesture). */
async function back(p: Page, depth: number) {
  await expect.poll(() => p.evaluate(() => (history.state as { manwarBack?: number } | null)?.manwarBack ?? 0)).toBe(depth);
  await p.goBack();
}
/** Two taps on one spot, as fast as a double tap. */
async function doubleTap(p: Page, sel: ReturnType<Page['locator']>) {
  const b = (await sel.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await p.mouse.click(x, y);
  await p.waitForTimeout(120);
  await p.mouse.click(x, y);
}
const stored = async (household: string, path: string) => {
  const res = await fetch(`${FS}/households/demo-${household}/${path}`, { headers: OWNER });
  return res.status === 200 ? ((await res.json()) as { fields: Record<string, Record<string, string>> }) : null;
};
/** The stored timer: its run, minutes, and the runs stopped. */
async function timerDoc(household: string) {
  const f = (await stored(household, 'timers/wall'))!.fields as unknown as {
    run: { stringValue: string };
    minutes: { integerValue: string };
    stopped?: { mapValue: { fields?: Record<string, unknown> } };
  };
  return {
    run: f.run.stringValue,
    minutes: Number(f.minutes.integerValue),
    stopped: Object.keys(f.stopped?.mapValue.fields ?? {}),
  };
}
/** Start a timer on the wall's own keypad (Home's Timer button). */
async function startAtWall(w: Page, digit: string) {
  await w.locator('.rail button', { hasText: 'Home' }).click();
  await w.getByRole('button', { name: 'Timer' }).click();
  await w.locator('.modal').getByRole('button', { name: digit, exact: true }).click();
  await w.getByRole('button', { name: 'Start' }).click();
}
/** Offline, the browser reports each request it could not make. */
const real = (errors: string[]) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e));

test('a note posted on the phone pops up on the wall; dismissed on either side, it goes on both', async ({ browser }) => {
  const hh = name('note');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Note to the wall');
  await p.page.getByRole('button', { name: 'Mamma' }).click();
  await p.page.getByLabel('Note', { exact: true }).fill('Dinner at 7, wash your hands!');
  await p.page.getByRole('switch', { name: 'Read it aloud' }).click();
  await p.page.getByRole('button', { name: 'Post to the wall' }).click();
  await expect(p.page.getByLabel('Note', { exact: true })).toHaveValue('');
  const note = w.page.locator('.message-layer');
  await expect(note).toContainText('Dinner at 7, wash your hands!');
  await expect(note).toContainText('From: Mamma');
  // Read aloud is asked of the wall with the note.
  const docs = (await (await fetch(`${FS}/households/demo-${hh}/messages`, { headers: OWNER })).json()) as {
    documents: { fields: Record<string, { stringValue?: string; booleanValue?: boolean }> }[];
  };
  expect(
    docs.documents.find((d) => d.fields.text.stringValue === 'Dinner at 7, wash your hands!')?.fields.readAloud?.booleanValue,
  ).toBe(true);
  const shown = p.page.locator('.pn-note', { hasText: 'Dinner at 7' });
  await expect(shown).toContainText('Showing');
  await expect(shown).toContainText('From Mamma');
  // Dismissed on the phone: gone from the wall.
  await shown.getByRole('button', { name: /^Dismiss/ }).click();
  await expect(note).toHaveCount(0);
  await expect(p.page.getByText('No note on the wall.')).toBeVisible();
  // The phone remembers who its notes are from; dismissed at the wall, it goes on the phone.
  await p.page.getByLabel('Note', { exact: true }).fill('Back at 5');
  await expect(p.page.getByRole('button', { name: 'Mamma' })).toHaveAttribute('aria-pressed', 'true');
  await p.page.getByRole('button', { name: 'Post to the wall' }).click();
  await expect(note).toContainText('Back at 5');
  await w.page.locator('.message-ok').click();
  await expect(p.page.getByText('No note on the wall.')).toBeVisible();
  // The More row says what is on the wall.
  await p.page.getByLabel('Note', { exact: true }).fill('حليب في الثلاجة');
  await p.page.getByRole('button', { name: 'Post to the wall' }).click();
  await back(p.page, 2);
  await expect(p.page.locator('.ph-menu button', { hasText: 'Note to the wall' })).toContainText('حليب في الثلاجة');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a half-written note survives a reload (an update applied while the phone sat idle)', async ({ browser }) => {
  const hh = name('draft');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Note to the wall');
  await p.page.getByLabel('Note', { exact: true }).fill('Pick up the dry cleaning before');
  await p.page.reload();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await more(p.page, 'Note to the wall');
  await expect(p.page.getByLabel('Note', { exact: true })).toHaveValue('Pick up the dry cleaning before');
  // Posted, it is gone for good: a reload brings back an empty field.
  await p.page.getByRole('button', { name: 'Post to the wall' }).click();
  await expect(p.page.getByLabel('Note', { exact: true })).toHaveValue('');
  await p.page.reload();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await more(p.page, 'Note to the wall');
  await expect(p.page.getByLabel('Note', { exact: true })).toHaveValue('');
  expect(p.errors).toEqual([]);
});

test('a note posted while the wall sleeps waits; the phone says so and can wake it', async ({ browser }) => {
  const hh = name('asleep');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Wall screen');
  await p.page.getByRole('button', { name: /Sleep now/ }).click();
  await expect(w.page.locator('.sleep-screen')).toBeVisible();
  await more(p.page, 'Note to the wall');
  await p.page.getByLabel('Note', { exact: true }).fill('Lights out at 9');
  await p.page.getByRole('button', { name: 'Post to the wall' }).click();
  await expect(p.page.locator('.pn-asleep')).toContainText('likely asleep');
  // Behind the sleep screen until woken.
  await w.page.waitForTimeout(1000);
  await expect(w.page.locator('.sleep-screen')).toBeVisible();
  await p.page.getByRole('button', { name: 'Wake the wall' }).click();
  await expect(w.page.locator('.sleep-screen')).toHaveCount(0);
  await expect(w.page.locator('.message-layer')).toContainText('Lights out at 9');
  await expect(p.page.locator('.pn-asleep')).toHaveCount(0);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a timer started on the phone runs on the wall; stopped on either side, it stops on both', async ({ browser }) => {
  const hh = name('timer');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Wall timer');
  await p.page.getByRole('button', { name: '5 minutes', exact: true }).click();
  await expect(p.page.locator('.pt-total')).toContainText('5 min timer');
  const layer = w.page.locator('.timer-layer');
  await expect(layer).toBeVisible();
  await expect(layer.locator('.timer-total')).toContainText('5 min');
  // It counts down on the phone once the wall's 3, 2, 1 is over.
  await expect(p.page.locator('.pt-big')).toHaveText(/^4:5\d$/, { timeout: 10_000 });
  await p.page.getByRole('button', { name: 'Stop timer' }).click();
  await expect(layer).toHaveCount(0);
  await expect(p.page.getByRole('button', { name: '5 minutes', exact: true })).toBeVisible();

  // Any number of minutes; stopped at the wall this time.
  await p.page.getByLabel('Any number of minutes').fill('0x7');
  await expect(p.page.getByLabel('Any number of minutes')).toHaveValue('7');
  await p.page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(layer.locator('.timer-total')).toContainText('7 min');
  await layer.getByRole('button', { name: 'Stop timer' }).click();
  await expect(p.page.getByRole('button', { name: '5 minutes', exact: true })).toBeVisible();
  await expect(p.page.locator('.pt-run')).toHaveCount(0);
  // The wall knows the stop, for this run (it resumes scheduled sleep from it).
  const t = await timerDoc(hh);
  expect(t.stopped).toEqual([t.run]);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('an offline phone queues no start or stop: it says it could not reach the wall', async ({ browser }) => {
  const hh = name('offline');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Wall timer');
  await p.page.context().setOffline(true);
  // The wall starts a timer the offline phone does not hear of; the phone starts its own.
  await startAtWall(w.page, '9');
  const layer = w.page.locator('.timer-layer');
  await expect(layer.locator('.timer-total')).toContainText('9 min');
  await p.page.getByRole('button', { name: '5 minutes', exact: true }).click();
  const unreachable = p.page.locator('.toast', { hasText: "Could not reach the wall. Check this phone's connection" });
  await expect(unreachable).toBeVisible({ timeout: 20_000 });
  await expect(p.page.locator('.pt-run')).toHaveCount(0);
  await p.page.context().setOffline(false);
  // Back online, the phone shows the wall's timer, which nothing replaced.
  await expect(p.page.locator('.pt-total')).toContainText('9 min timer', { timeout: 30_000 });
  await w.page.waitForTimeout(1500);
  await expect(layer.locator('.timer-total')).toContainText('9 min');
  expect((await timerDoc(hh)).minutes).toBe(9);

  // Nor a stop: the timer runs on.
  await expect(unreachable).toHaveCount(0, { timeout: 10_000 });
  await p.page.context().setOffline(true);
  await p.page.getByRole('button', { name: 'Stop timer' }).click();
  await expect(unreachable).toBeVisible({ timeout: 20_000 });
  await p.page.context().setOffline(false);
  await w.page.waitForTimeout(1500);
  await expect(layer.locator('.timer-total')).toContainText('9 min');
  await expect(p.page.locator('.pt-total')).toContainText('9 min timer');
  expect((await timerDoc(hh)).stopped).toEqual([]);
  expect(real([...w.errors, ...p.errors])).toEqual([]);
});

test('a stop that lands late, from a wall that was offline, leaves the timer started since', async ({ browser }) => {
  const hh = name('latestop');
  const hall = await wall(browser, hh);
  const kitchen = await wall(browser, hh);
  const hallLayer = hall.page.locator('.timer-layer');
  const kitchenLayer = kitchen.page.locator('.timer-layer');
  await startAtWall(hall.page, '5');
  await expect(kitchenLayer.locator('.timer-total')).toContainText('5 min');
  // The hall tablet's Wi-Fi drops as it stops the timer; the kitchen stops it too, and starts another.
  await hall.page.context().setOffline(true);
  await hallLayer.getByRole('button', { name: 'Stop timer' }).click();
  await expect(hallLayer).toHaveCount(0);
  await kitchenLayer.getByRole('button', { name: 'Stop timer' }).click();
  await startAtWall(kitchen.page, '7');
  await expect(kitchenLayer.locator('.timer-total')).toContainText('7 min');
  await hall.page.context().setOffline(false);
  // The hall's stop lands, naming the 5-minute run: the 7-minute one runs on, on both walls.
  await expect(hallLayer.locator('.timer-total')).toContainText('7 min', { timeout: 30_000 });
  await kitchen.page.waitForTimeout(1500);
  await expect(kitchenLayer.locator('.timer-total')).toContainText('7 min');
  const t = await timerDoc(hh);
  expect(t.minutes).toBe(7);
  expect(t.stopped).toHaveLength(1);
  expect(t.stopped).not.toContain(t.run);
  expect(real([...hall.errors, ...kitchen.errors])).toEqual([]);
});

test('a timer started from the phone ends Sleep now on the wall; one already running does not', async ({ browser }) => {
  const hh = name('sleeptimer');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  const asleep = w.page.locator('.sleep-screen');
  const layer = w.page.locator('.timer-layer');
  await more(p.page, 'Wall timer');
  await p.page.getByRole('button', { name: '5 minutes', exact: true }).click();
  await expect(layer.locator('.timer-total')).toContainText('5 min');
  // Sleep now with that timer running: the wall sleeps, and stays asleep when it is stopped.
  await more(p.page, 'Wall screen');
  await p.page.getByRole('button', { name: /Sleep now/ }).click();
  await expect(asleep).toBeVisible();
  await more(p.page, 'Wall timer');
  await w.page.waitForTimeout(1000);
  await expect(asleep).toBeVisible();
  await p.page.getByRole('button', { name: 'Stop timer' }).click();
  await expect(p.page.getByRole('button', { name: '10 minutes', exact: true })).toBeVisible();
  await w.page.waitForTimeout(1000);
  await expect(asleep).toBeVisible();
  // A new timer: the wall wakes to show it, as the phone says it does.
  await expect(p.page.locator('.pt-note')).toHaveText('The wall shows the timer full screen and chimes when it ends.');
  await p.page.getByRole('button', { name: '10 minutes', exact: true }).click();
  await expect(asleep).toHaveCount(0);
  await expect(layer.locator('.timer-total')).toContainText('10 min');
  // Stopped, the wall stays awake: Sleep now ended with the new timer, and the phone's guess agrees.
  await p.page.getByRole('button', { name: 'Stop timer' }).click();
  await expect(layer).toHaveCount(0);
  await w.page.waitForTimeout(1000);
  await expect(asleep).toHaveCount(0);
  await more(p.page, 'Wall screen');
  await expect(p.page.locator('.pws-state')).toContainText('The wall is likely awake');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('two phones starting the timer at once end with the same timer, as the wall shows it', async ({ browser }) => {
  const hh = name('twotimers');
  const w = await wall(browser, hh);
  const a = await phone(browser, hh);
  const b = await phone(browser, hh);
  await more(a.page, 'Wall timer');
  await more(b.page, 'Wall timer');
  await Promise.all([
    a.page.getByRole('button', { name: '5 minutes', exact: true }).click(),
    b.page.getByRole('button', { name: '30 minutes', exact: true }).click(),
  ]);
  // The phone that lost the race says so (its transaction ran again and found the other's timer).
  const lost = (p: Page) => p.locator('.toast', { hasText: 'A timer was just started on the wall.' }).count();
  await expect.poll(async () => (await lost(a.page)) + (await lost(b.page))).toBe(1);
  const layer = w.page.locator('.timer-layer');
  await expect(layer).toBeVisible();
  await w.page.waitForTimeout(1500);
  const minutes = Number((await stored(hh, 'timers/wall'))!.fields.minutes.integerValue);
  expect([5, 30]).toContain(minutes);
  await expect(a.page.locator('.pt-total')).toContainText(`${minutes} min timer`);
  await expect(b.page.locator('.pt-total')).toContainText(`${minutes} min timer`);
  await expect(layer.locator('.timer-total')).toContainText(`${minutes} min`);
  // The server turns the losing commit away (409) before it runs again: the browser reports that response.
  const conflict = /status of 409 \(Conflict\)/;
  expect([...w.errors, ...a.errors, ...b.errors].filter((e) => !conflict.test(e))).toEqual([]);
});

test('a double tap on Start does not stop the timer it started', async ({ browser }) => {
  const hh = name('doubletap');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Wall timer');
  await p.page.getByLabel('Any number of minutes').fill('12');
  await doubleTap(p.page, p.page.getByRole('button', { name: 'Start', exact: true }));
  await p.page.waitForTimeout(800);
  await expect(p.page.locator('.pt-run')).toBeVisible();
  await expect(w.page.locator('.timer-layer')).toBeVisible();
  expect((await timerDoc(hh)).stopped).toEqual([]);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a double tap on a More row opens it without pressing what lands under the second tap', async ({ browser }) => {
  const hh = name('morerow');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await p.page.locator('.ph-nav').getByRole('button', { name: 'More' }).click();
  await doubleTap(p.page, p.page.locator('.ph-menu button', { hasText: 'Wall timer' }));
  await expect(p.page.locator('.ph-head h1')).toHaveText('Wall timer');
  await p.page.locator('.ph-back').click();
  await doubleTap(p.page, p.page.locator('.ph-menu button', { hasText: 'Wall screen' }));
  await expect(p.page.locator('.ph-head h1')).toHaveText('Wall screen');
  await p.page.waitForTimeout(1000);
  // No timer started, no Sleep or Wake sent.
  expect(await stored(hh, 'timers/wall')).toBeNull();
  expect(await stored(hh, 'commands/display')).toBeNull();
  await expect(p.page.getByText('Nothing asked from a phone yet.')).toBeVisible();
  await expect(w.page.locator('.timer-layer')).toHaveCount(0);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('Sleep now from the phone blanks the wall and Wake up wakes it; the phone says what it asked', async ({ browser }) => {
  const hh = name('screen');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Wall screen');
  await expect(p.page.locator('.pws-state')).toContainText('The wall is likely awake');
  await p.page.getByRole('button', { name: /Sleep now/ }).click();
  await expect(w.page.locator('.sleep-screen')).toBeVisible();
  await expect(p.page.locator('.pws-state')).toContainText('The wall is likely asleep');
  await expect(p.page.locator('.pws-state')).toContainText('Sleep now, asked at 11:44 AM.');
  await p.page.getByRole('button', { name: /Wake up/ }).click();
  await expect(w.page.locator('.sleep-screen')).toHaveCount(0);
  await expect(p.page.locator('.pws-state')).toContainText('The wall is likely awake');
  await expect(p.page.locator('.pws-state')).toContainText('Wake up, asked at 11:44 AM.');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test("the phone shows tonight's dinner and plans the week, and the wall's grid shows the plan", async ({ browser }) => {
  const hh = name('meals');
  const w = await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Meals');
  await expect(p.page.locator('.pm-tonight')).toContainText('Chicken biryani');
  const sat = p.page.locator('.pm-day', { hasText: 'Saturday, Nov 7' });
  await sat.getByRole('button', { name: /^Plan a meal on/ }).click();
  const sheet = p.page.getByRole('dialog', { name: 'Plan meal' });
  await expect(sheet).toContainText('Saturday, Nov 7');
  await p.page.waitForTimeout(500);
  await sheet.locator('.pick-row', { hasText: 'Spaghetti' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(sat.locator('.pm-meal', { hasText: 'Spaghetti' })).toBeVisible();
  await w.page.locator('.rail button', { hasText: 'Meals' }).click();
  await expect(w.page.locator('[data-cell^="2026-11-07|"] .mg-entry', { hasText: 'Spaghetti' })).toBeVisible();

  // Tonight's ingredients go to the grocery list, without what is on it already.
  await p.page.locator('.pm-tonight').getByRole('button', { name: 'Add ingredients' }).click();
  const modal = p.page.getByRole('dialog', { name: 'Add to Grocery List?' });
  await p.page.waitForTimeout(500);
  await modal.getByRole('button', { name: /^Add \d+ items?$/ }).click();
  await expect(p.page.locator('.toast', { hasText: /Added \d+ items? to Grocery List/ })).toBeVisible();
  await p.page.locator('.ph-nav').getByRole('button', { name: 'Lists' }).click();
  await p.page.locator('.phl-row', { hasText: 'Grocery List' }).click();
  await expect(p.page.locator('.phl-card .li-row', { hasText: /chicken thighs/i })).toBeVisible();
  await expect(p.page.locator('.phl-card .li-row', { hasText: /basmati rice/i })).toHaveCount(1);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test("the phone's Back closes a meal's card and the plan sheet, then Meals", async ({ browser }) => {
  const hh = name('mealsback');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Meals');
  await p.page.locator('.pm-tonight .pm-meal').click();
  const card = p.page.locator('.popover .meal-pop');
  await expect(card).toBeVisible();
  // No Recipes tab on the phone to open the recipe on.
  await expect(card.getByRole('button', { name: 'Open recipe' })).toHaveCount(0);
  await back(p.page, 3);
  await expect(card).toHaveCount(0);
  await p.page
    .locator('.pm-day.today')
    .getByRole('button', { name: /^Plan a meal on/ })
    .click();
  await expect(p.page.getByRole('dialog', { name: 'Plan meal' })).toBeVisible();
  await back(p.page, 3);
  await expect(p.page.getByRole('dialog', { name: 'Plan meal' })).toHaveCount(0);
  await back(p.page, 2);
  await expect(p.page.locator('.ph-head h1')).toHaveText('More');
  expect(p.errors).toEqual([]);
});

test('nothing runs off the side at 360 px with a larger text size, in light and dark', async ({ browser }) => {
  const hh = name('narrow');
  await wall(browser, hh);
  for (const theme of ['light', 'dark']) {
    const ctx = await newContext(browser, {
      viewport: { width: 360, height: 780 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      timezoneId: 'America/Chicago',
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?demo=${hh}&layout=phone&now=2026-11-04T11:44&theme=${theme}`);
    await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => (document.documentElement.style.fontSize = '75%'));
    /** Every box inside the screen's width: nothing to scroll sideways, nothing cut at the right. */
    const fits = () =>
      page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll<HTMLElement>('.ph-body *, .sheet *, .popover *')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > w + 0.5 || r.left < -0.5);
        });
        return over.map((el) => `${el.tagName}.${el.className}`).slice(0, 5);
      });
    await page.locator('.ph-nav').getByRole('button', { name: 'Lists' }).click();
    expect(await fits()).toEqual([]);
    await page.locator('.phl-row', { hasText: 'Grocery List' }).click();
    await page.waitForTimeout(500);
    expect(await fits()).toEqual([]);
    for (const row of ['Meals', 'Note to the wall', 'Wall timer', 'Wall screen']) {
      await more(page, row);
      expect(await fits(), row).toEqual([]);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

test('an empty household: a typed dinner, a note from no one, and the timer', async ({ browser }) => {
  const hh = name('empty');
  const w = await wall(browser, hh, '&seed=none');
  const p = await phone(browser, hh);
  await more(p.page, 'Meals');
  await expect(p.page.locator('.pm-tonight')).toContainText('Nothing planned for dinner.');
  await p.page.getByRole('button', { name: 'Plan dinner' }).click();
  const sheet = p.page.getByRole('dialog', { name: 'Plan meal' });
  await p.page.waitForTimeout(500);
  await sheet.getByPlaceholder('Tacos').fill('Tacos');
  await sheet.getByRole('button', { name: 'Plan meal' }).click();
  await expect(p.page.locator('.pm-tonight')).toContainText('Tacos');
  await more(p.page, 'Note to the wall');
  // No people yet: nobody to choose as the sender.
  await expect(p.page.getByText('From', { exact: true })).toHaveCount(0);
  await p.page.getByLabel('Note', { exact: true }).fill('Welcome home');
  await p.page.getByRole('button', { name: 'Post to the wall' }).click();
  await expect(w.page.locator('.message-layer')).toContainText('Welcome home');
  await more(p.page, 'Wall timer');
  await p.page.getByRole('button', { name: '10 minutes', exact: true }).click();
  await expect(w.page.locator('.timer-layer')).toBeVisible();
  await p.page.locator('.ph-nav').getByRole('button', { name: 'Lists' }).click();
  await expect(p.page.locator('.phl-row')).toHaveCount(1);
  await expect(p.page.locator('.phl-row')).toContainText('Nothing on it yet');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test("this week's days before today fold into one row, so today shows first; another week shows whole", async ({
  browser,
}) => {
  const hh = name('mealsfold');
  await wall(browser, hh);
  const p = await phone(browser, hh);
  await more(p.page, 'Meals');
  // Wednesday: Sunday to Tuesday are one row, and today's card comes first.
  const earlier = p.page.locator('.pm-earlier');
  await expect(earlier).toContainText('Earlier this week');
  await expect(earlier).toContainText('Sun to Tue');
  await expect(p.page.locator('.pm-day', { hasText: 'Sunday, Nov 1' })).toHaveCount(0);
  await expect(p.page.locator('.pm-day').first()).toHaveClass(/today/);
  await earlier.click();
  await expect(earlier).toHaveCount(0);
  await expect(p.page.locator('.pm-day').first()).toContainText('Sunday, Nov 1');
  // Next week has no past days to fold; back on this week, they fold again.
  await p.page.getByRole('button', { name: 'Next week' }).click();
  await expect(p.page.locator('.pm-day')).toHaveCount(7);
  await expect(earlier).toHaveCount(0);
  await p.page.getByRole('button', { name: /back to this week/ }).click();
  await expect(earlier).toBeVisible();
  expect(p.errors).toEqual([]);
});
