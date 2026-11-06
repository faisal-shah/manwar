import { createHash } from 'node:crypto';
import { expect as baseExpect, test, devices, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { newContext, NOW, type Opened, pairPhone, wall } from './phone-helpers';

/*
 * The phone's Calendar tab: the agenda, event details, adding and editing
 * events, and To assign, on a demo household its wall seeded. The demo
 * calendar lives in each browser's storage (a phone and the wall each have
 * their own copy, seeded alike from the same `now`); assignments and
 * countdowns are in Firestore and cross devices.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });
const RUN = Date.now().toString(36);

// Each test opens a wall and phones in contexts of their own: close them all when it ends, so the machine
// (and the shared emulators) do not carry every test's browsers to the end of the run.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});
const FS = 'http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents';

const READING = 'family@demo::reading_20261104';
const DENTIST = 'family@demo::dentist';
const PT = 'mamma@demo::pt-meeting';
const LIBRARY = 'mamma@demo::library';
const day = (page: Page, d: string) => page.locator(`.phc-day[data-day="${d}"]`);
const calTab = (page: Page) => page.locator('.ph-nav button', { hasText: 'Calendar' });

/** A demo calendar of `masters` (calendar/fake.ts) for a phone, written before the app starts and only then. */
function demoCalendar(masters: object[]): string {
  const json = JSON.stringify(JSON.stringify(masters));
  return `if (!sessionStorage.getItem('demoCal')) { sessionStorage.setItem('demoCal', '1'); localStorage.setItem('manwar.demoCalendar.v1', ${json}); }`;
}
const timed = (id: string, title: string, day: string, startMin: number, durMin: number, extra: object = {}) => ({
  id,
  calendarId: 'family@demo',
  title,
  allDay: false,
  day,
  startMin,
  durMin,
  days: 1,
  exdates: [],
  overrides: {},
  ...extra,
});

function track(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Could not reach Cloud Firestore backend|net::ERR_INTERNET_DISCONNECTED/.test(m.text()))
      errors.push(m.text());
  });
  return errors;
}

/** The wall of a new demo household, once it has seeded (three of Mamma's events wait to be assigned). */
async function seededWall(browser: Browser, household: string, now = NOW): Promise<Opened> {
  const w = now === NOW ? await wall(browser, household) : await wallAt(browser, household, now);
  await expect(w.page.locator('.rail .badge')).toHaveText('3', { timeout: 30_000 });
  return w;
}

async function wallAt(browser: Browser, household: string, now: string): Promise<Opened> {
  const page = await (
    await newContext(browser, { viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Chicago' })
  ).newPage();
  const errors = track(page);
  await page.goto(`/?demo=${household}&${now}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  return { page, errors };
}

/** The smallest phone screen it is made for, with touch. */
const SMALL = { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
/** The phone's text size set larger (rem is a share of it). */
const LARGER_TEXT = `addEventListener('DOMContentLoaded', () => (document.documentElement.style.fontSize = '75%'))`;

/** A phone (Pixel 7 unless `screen` says, not paired: signed in as the wall) on the Calendar tab. `init` runs before the app. */
async function phoneCal(
  browser: Browser,
  household: string,
  opts: { now?: string; init?: string; screen?: BrowserContextOptions } = {},
) {
  const ctx = await newContext(browser, { ...(opts.screen ?? devices['Pixel 7']), timezoneId: 'America/Chicago' });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const errors = track(page);
  await page.goto(`/?demo=${household}&layout=phone&${opts.now ?? NOW}`);
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await calTab(page).click();
  await expect(page.locator('.phc-day').first()).toBeVisible();
  return { page, errors, ctx };
}

async function pair(browser: Browser, name: string) {
  const household = `phcal-${RUN}-${name}`;
  const w = await seededWall(browser, household);
  const p = await phoneCal(browser, household);
  return { household, w, p };
}

/** Sets the parent PIN the way core/lock.ts stores it, straight into the emulator. */
async function setPin(household: string, pin: string) {
  const salt = 'e2e-salt';
  const pinHash = createHash('sha256').update(`${salt}:${pin}`).digest('hex');
  const res = await fetch(`${FS}/households/demo-${household}/settings/main?updateMask.fieldPaths=lock`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        lock: {
          mapValue: {
            fields: {
              salt: { stringValue: salt },
              pinHash: { stringValue: pinHash },
              relockMinutes: { integerValue: '5' },
            },
          },
        },
      },
    }),
  });
  expect(res.ok, await res.text()).toBe(true);
}

/** The back stack holds `depth` entries (the page's own history.back() has landed). */
const backDepth = (page: Page, depth: number) =>
  expect.poll(() => page.evaluate(() => Number((history.state as { manwarBack?: number } | null)?.manwarBack ?? 0))).toBe(depth);

test('the agenda: today first with the Now line, all-day events first, more days, Go to date and Today', async ({ browser }) => {
  const { p } = await pair(browser, 'agenda');
  const page = p.page;
  const today = day(page, '2026-11-04');
  await expect(today.locator('.phc-day-name')).toHaveText('Today');
  await expect(day(page, '2026-11-05').locator('.phc-day-name')).toHaveText('Tomorrow');
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  // At 11:44 Reading (11:15 - 11:45) is under way, Handwriting is over, and the Now line comes before Math.
  await expect(today.locator(`[data-event="${READING}"]`)).toHaveClass(/current/);
  await expect(today.locator('[data-event="family@demo::handwriting_20261104"]')).toHaveClass(/ended/);
  const order = await today
    .locator('.phc-rows > li')
    .evaluateAll((lis) =>
      lis.map((li) => (li.classList.contains('phc-now') ? 'NOW' : li.querySelector('[data-event]')?.getAttribute('data-event'))),
    );
  expect(order[order.indexOf('NOW') - 1]).toBe(READING);
  expect(order[order.indexOf('NOW') + 1]).toBe('family@demo::math_20261104');
  // Grandma visits for four days from Nov 12: all day, first on each of them.
  for (const [d, n] of [
    ['2026-11-12', 1],
    ['2026-11-15', 4],
  ] as const) {
    const first = day(page, d).locator('.phc-rows > li').first();
    await expect(first).toContainText('Grandma visiting');
    await expect(first).toContainText(`Day ${n} of 4`);
    await expect(first).toContainText('All day');
  }
  // People as avatars, the unassigned "?" on Mamma's events.
  await expect(page.locator(`[data-event="${PT}"] .ev-q`)).toHaveCount(1);
  await expect(page.locator(`[data-event="family@demo::nap_20261104"] .avatar`)).toHaveCount(1);

  // Scrolling to the end adds days past the first three weeks; Today comes back.
  const list = page.locator('.phc-list');
  for (let i = 0; i < 8 && !(await day(page, '2026-12-08').count()); i++) {
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(250);
  }
  await expect(day(page, '2026-12-08')).toHaveCount(1);
  await expect(page.locator('.ph-head h1')).toHaveText(/November|December/);
  await page.locator('.phc-today').click();
  await expect(page.locator('.phc-today')).toHaveCount(0);
  await expect(page.locator('.ph-head h1')).toHaveText('November');

  // Go to a day past the loaded window: it is fetched, not shown empty.
  await page.getByLabel('Go to a date').fill('2027-05-10');
  await expect(page.locator('.ph-head h1')).toHaveText('May 2027');
  await expect(page.locator('.phc-day').first()).toHaveAttribute('data-day', '2027-05-10');
  await expect(day(page, '2027-05-10').locator('.phc-day-name')).toHaveText('Monday');
  await expect(page.locator('[data-event="family@demo::reading_20270510"]')).toBeVisible();
  await page.locator('.phc-today').click();
  await expect(today).toBeVisible();
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  expect(p.errors).toEqual([]);
});

test('the person filter is kept on the phone and leaves the wall alone', async ({ browser }) => {
  const { w, p } = await pair(browser, 'filter');
  const page = p.page;
  const prep = page.locator('[data-event="family@demo::prep-dinner_20261104"]');
  await expect(prep).toBeVisible();
  await page.locator('.phc-filter').getByRole('button', { name: 'Hashim!', exact: true }).click();
  // Mamma's event goes; Hashim's, the family's and the unassigned ones stay.
  await expect(prep).toHaveCount(0);
  await expect(page.locator('[data-event="family@demo::nap_20261104"]')).toHaveCount(1);
  await expect(page.locator('[data-event="family@demo::dinner_20261104"]')).toHaveCount(1);
  await expect(page.locator(`[data-event="${PT}"]`)).toHaveCount(1);
  await page.reload();
  await calTab(page).click();
  await expect(page.locator('.phc-filter').getByRole('button', { name: 'Hashim!', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-event="family@demo::nap_20261104"]')).toHaveCount(1);
  await expect(prep).toHaveCount(0);
  // The wall still shows everyone.
  await expect(w.page.locator('[data-event="family@demo::prep-dinner_20261104"]')).toBeVisible();
  await page.locator('.phc-filter').getByRole('button', { name: 'All' }).click();
  await expect(prep).toHaveCount(1);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('event details: maps, why a read-only event cannot be changed, countdowns both ways', async ({ browser }) => {
  const { w, p } = await pair(browser, 'detail');
  const page = p.page;
  await page.locator(`[data-event="${DENTIST}"]`).click();
  const sheet = page.locator('.ev-detail');
  await expect(sheet.locator('.evd-loc')).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=Smile%20Dental',
  );
  await expect(sheet.getByRole('button', { name: 'Edit' })).toBeVisible();
  // A countdown turned on here shows on the wall.
  await sheet.getByRole('switch', { name: 'Countdown' }).click();
  await expect(sheet).toContainText('2 days until event');
  await expect(w.page.locator('.cal-cd')).toContainText('Dentist');
  await page.goBack();
  await expect(sheet).toHaveCount(0);

  // Mamma's calendar is shared read-only: no Edit or Delete, and it says why.
  await page.locator(`[data-event="${PT}"]`).click();
  await expect(sheet).toContainText("Can't be changed here");
  await expect(sheet.locator('.evd-why')).toContainText(
    /^\u2068Mamma's calendar\u2069 is shared with the household to read only\./,
  );
  await expect(sheet.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await page.goBack();
  await expect(sheet).toHaveCount(0);

  // A countdown turned on at the wall shows on the phone.
  await w.page.locator('[data-event="family@demo::playdate"]').click();
  await w.page.locator('.ev-detail').getByRole('switch', { name: 'Countdown' }).click();
  await page.locator('[data-event="family@demo::playdate"]').click();
  await expect(sheet.getByRole('switch', { name: 'Countdown' })).toHaveAttribute('aria-checked', 'true');
  await expect(sheet).toContainText('1 day until event');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('To assign: a tap assigns, both badges go down, and the wall’s assignments show here', async ({ browser }) => {
  const { w, p } = await pair(browser, 'assign');
  const page = p.page;
  await expect(calTab(page).locator('.badge')).toHaveText('3');
  await page.getByRole('button', { name: '3 events to assign' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('To assign');
  const row = page.locator(`[data-triage="${PT}"]`);
  await row.getByRole('button', { name: 'Hashim!', exact: true }).click();
  await expect(row).toContainText('For Hashim!');
  await expect(calTab(page).locator('.badge')).toHaveText('2');
  await expect(w.page.locator('.rail .badge')).toHaveText('2');
  await expect(w.page.locator(`[data-event="${PT}"] .ev-q`)).toHaveCount(0);
  // A second person joins with one more tap; the row stays where it was.
  await row.getByRole('button', { name: 'Mamma', exact: true }).click();
  await expect(row).toContainText('For Hashim!, Mamma');
  await expect(w.page.locator(`[data-event="${PT}"] .avatar`)).toHaveCount(2);

  // The wall assigns another one from its own queue: it leaves the phone's queue too.
  await w.page.locator('.triage-btn').click();
  const wallRow = w.page.locator(`.triage-row[data-triage="${LIBRARY}"]`);
  await wallRow.locator('.picker button', { hasText: 'Asiyah' }).click();
  await wallRow.getByRole('button', { name: 'Assign' }).click();
  await expect(calTab(page).locator('.badge')).toHaveText('1');
  await expect(page.locator(`[data-triage="${LIBRARY}"]`)).toContainText('For Asiyah');
  await expect(page.locator(`[data-triage="${LIBRARY}"]`).getByRole('button', { name: 'Asiyah', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Taking the last person off puts it back in the queue. (A tap on the chip tapped last, within the
  // double-tap time, is the rest of that double tap: wait it out.)
  await page.waitForTimeout(500);
  await row.getByRole('button', { name: 'Mamma', exact: true }).click();
  await row.getByRole('button', { name: 'Hashim!', exact: true }).click();
  await expect(calTab(page).locator('.badge')).toHaveText('2');
  await expect(w.page.locator('.rail .badge')).toHaveText('2');
  // Back returns to the agenda.
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test("a holiday calendar's events never wait in To assign, on the phone or the wall", async ({ browser }) => {
  const household = `phcal-${RUN}-holidays`;
  // Never seeded: no event has an assignment, so everything but the holidays waits.
  const w = await wall(browser, household, '&seed=none');
  await expect(w.page.locator('.rail .badge')).toBeVisible({ timeout: 30_000 });
  const p = await phoneCal(browser, household, { now: `${NOW}&seed=none` });
  const page = p.page;
  await page.locator('.phc-waiting').click();
  await expect(page.locator('.ph-head h1')).toHaveText('To assign');
  await expect(page.locator('.phc-tri').first()).toBeVisible();
  await expect(page.locator('.phc-tri', { hasText: 'Library' })).toHaveCount(1);
  for (const holiday of ['Veterans Day', 'Thanksgiving Day', 'Christmas Day'])
    await expect(page.locator('.phc-tri', { hasText: holiday })).toHaveCount(0);
  await w.page.locator('.triage-btn').click();
  await expect(w.page.locator('.triage-row').first()).toBeVisible();
  await expect(w.page.locator('.triage-row', { hasText: 'Veterans Day' })).toHaveCount(0);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('one lesson of a series that has people waits alone and is assigned alone', async ({ browser }) => {
  const household = `phcal-${RUN}-alone`;
  const w = await seededWall(browser, household);
  // Thursday's reading lost its person (a profile delete leaves NOBODY): it waits, the series stays Asiyah's.
  const key = encodeURIComponent('family@demo::reading_20261105');
  const res = await fetch(`${FS}/households/demo-${household}/eventMeta/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        id: { stringValue: key },
        profiles: { arrayValue: { values: [{ stringValue: '-' }] } },
        updatedAt: { integerValue: '1' },
      },
    }),
  });
  expect(res.ok, await res.text()).toBe(true);
  await expect(w.page.locator('.rail .badge')).toHaveText('4');
  const p = await phoneCal(browser, household);
  const page = p.page;
  await page.locator('.phc-waiting').click();
  const row = page.locator('[data-triage="family@demo::reading"]');
  await expect(row).toContainText('This time only');
  // The intro does not promise every time for a row that says this time only.
  await expect(page.locator('.phc-assign-intro')).toHaveText(
    'Tap who each event is for. A repeating event says whether that is every time it repeats or this time only.',
  );
  await expect(row).toContainText('Thursday, Nov 5');
  await row.getByRole('button', { name: 'Hashim!', exact: true }).click();
  await expect(row).toContainText('For Hashim!');
  // Tapped again with a second person: still that lesson alone.
  await row.getByRole('button', { name: 'Mamma', exact: true }).click();
  await expect(row).toContainText('For Hashim!, Mamma');
  await expect(w.page.locator('.rail .badge')).toHaveText('3');
  await page.goBack();
  const avatars = (id: string) => page.locator(`[data-event="family@demo::${id}"] .avatar`);
  await expect(avatars('reading_20261105')).toHaveCount(2);
  await expect(avatars('reading_20261106')).toHaveCount(1);
  await expect(page.locator('[data-event="family@demo::reading_20261106"] .avatar')).toHaveText('A');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a repeating event waiting to be assigned gets every tap for the whole series', async ({ browser }) => {
  const household = `phcal-${RUN}-series`;
  const w = await seededWall(browser, household);
  // Swim lessons with nobody: the series waits (once the seed has reached the server, or it would bring it back).
  const doc = `${FS}/households/demo-${household}/eventMeta/${encodeURIComponent(encodeURIComponent('family@demo::swim'))}`;
  await expect.poll(async () => (await fetch(doc, { headers: { Authorization: 'Bearer owner' } })).status).toBe(200);
  const res = await fetch(doc, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  expect(res.ok, await res.text()).toBe(true);
  await expect(w.page.locator('.rail .badge')).toHaveText('4');
  const p = await phoneCal(browser, household);
  const page = p.page;
  await page.locator('.phc-waiting').click();
  const row = page.locator('[data-triage="family@demo::swim"]');
  await expect(row).toContainText('Every time it repeats');
  await row.getByRole('button', { name: 'Hashim!', exact: true }).click();
  await expect(row).toContainText('For Hashim!');
  // The series has someone now; the next tap still changes the series, not one lesson.
  await row.getByRole('button', { name: 'Asiyah', exact: true }).click();
  await expect(row).toContainText('For Hashim!, Asiyah');
  await page.goBack();
  for (const d of ['20261107', '20261114', '20261121'])
    await expect(page.locator(`[data-event="family@demo::swim_${d}"] .avatar`)).toHaveCount(2);
  await expect(w.page.locator('.rail .badge')).toHaveText('3');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a double tap on a chip assigns once, and quick taps on two chips keep both', async ({ browser }) => {
  const { w, p } = await pair(browser, 'double');
  const page = p.page;
  await page.locator('.phc-waiting').click();
  const row = page.locator(`[data-triage="${PT}"]`);
  await row.getByRole('button', { name: 'Baba', exact: true }).dblclick();
  await expect(row).toContainText('For Baba');
  await page.waitForTimeout(800);
  await expect(row.getByRole('button', { name: 'Baba', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(w.page.locator('.rail .badge')).toHaveText('2');
  // Two chips in quick succession (the store has not shown the first yet): both stay.
  const lib = page.locator(`[data-triage="${LIBRARY}"]`);
  await lib.evaluate((el) => {
    const chip = (name: string) =>
      [...el.querySelectorAll('.phc-chip')].find((b) => b.querySelector('bdi')?.textContent === name) as HTMLElement;
    chip('Asiyah').click();
    chip('Mamma').click();
  });
  await expect(lib).toContainText('For Asiyah, Mamma');
  await expect(w.page.locator('.rail .badge')).toHaveText('1');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('the header + adds an event on the day looked at; a repeating one is edited and deleted by scope', async ({ browser }) => {
  const { p } = await pair(browser, 'edit');
  const page = p.page;
  await day(page, '2026-11-06').evaluate((el) => el.scrollIntoView());
  await page.getByRole('button', { name: 'Add event' }).click();
  const editor = page.locator('.sheet');
  await expect(editor.locator('input[name="startDate"]')).toHaveValue('2026-11-06');
  await expect(editor.locator('input[name="startTime"]')).toHaveValue('09:00');
  await editor.locator('input[name="title"]').fill('Bake sale');
  await editor.locator('.picker button', { hasText: 'Asiyah' }).click();
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Event added');
  await expect(editor).toHaveCount(0);
  await expect(day(page, '2026-11-06').locator('.phc-ev', { hasText: 'Bake sale' })).toBeVisible();

  // This event only: the next Saturday's lesson keeps its title.
  await page.locator('[data-event="family@demo::swim_20261107"]').click();
  await page.locator('.ev-detail').getByRole('button', { name: 'Edit' }).click();
  await editor.locator('input[name="title"]').fill('Swim gala');
  await editor.getByRole('button', { name: 'Save' }).click();
  await page.locator('.modal').getByRole('button', { name: 'This event' }).click();
  await expect(page.locator('.toast').last()).toContainText('Event saved');
  await expect(page.locator('[data-event="family@demo::swim_20261107"]')).toContainText('Swim gala');
  await expect(page.locator('[data-event="family@demo::swim_20261114"]')).toContainText('Swim lesson');
  // All events: every lesson goes.
  await page.locator('[data-event="family@demo::swim_20261114"]').click();
  await page.locator('.ev-detail').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.modal').getByRole('button', { name: 'All events' }).click();
  await expect(page.locator('.toast').last()).toContainText('Event deleted');
  await expect(page.locator('[data-event^="family@demo::swim_"]')).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

test('Back closes the sheet, the editor mid-edit, the scope choice and To assign, then leaves for Today', async ({ browser }) => {
  const { p } = await pair(browser, 'back');
  const page = p.page;
  await backDepth(page, 1);
  await page.locator(`[data-event="${READING}"]`).click();
  await expect(page.locator('.ev-detail')).toBeVisible();
  await backDepth(page, 2);
  await page.goBack();
  await expect(page.locator('.ev-detail')).toHaveCount(0);
  // The editor, with a title typed: Back closes it, and nothing is added.
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.locator('.sheet input[name="title"]').fill('Half typed');
  await backDepth(page, 2);
  await page.goBack();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('.phc-ev', { hasText: 'Half typed' })).toHaveCount(0);
  // Editing a repeating event: Back on the scope choice closes the choice only, and Save still works.
  await page.locator(`[data-event="${READING}"]`).click();
  await page.locator('.ev-detail').getByRole('button', { name: 'Edit' }).click();
  await page.locator('.sheet input[name="title"]').fill('Reading aloud');
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.modal')).toBeVisible();
  await backDepth(page, 3);
  await page.goBack();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.sheet')).toBeVisible();
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click();
  await page.locator('.modal').getByRole('button', { name: 'This event' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator(`[data-event="${READING}"]`)).toContainText('Reading aloud');
  // To assign, then the tab: Back walks out one at a time.
  await page.locator('.phc-waiting').click();
  await backDepth(page, 2);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  await backDepth(page, 1);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  expect(p.errors).toEqual([]);
});

test('an unpaired phone asks for the PIN; a paired one never does', async ({ browser }) => {
  const household = `phcal-${RUN}-pin`;
  const w = await seededWall(browser, household);
  // Paired first: the wall pairs behind the PIN.
  const paired = await pairPhone(browser, w.page, household, 'Baba phone');
  await setPin(household, '2468');
  const p = await phoneCal(browser, household);
  const page = p.page;
  await page.locator('.phc-waiting').click();
  await page.locator(`[data-triage="${PT}"]`).getByRole('button', { name: 'Hashim!', exact: true }).click();
  const pad = page.locator('.pin-keys');
  await expect(pad).toBeVisible();
  // The pad fits the phone: every key is on screen and big enough.
  for (const b of await pad.locator('button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.x + box.width).toBeLessThanOrEqual(412);
  }
  // (after the moment in which a tap still counts as the rest of the one that opened it)
  await page.waitForTimeout(500);
  for (const d of '2468') await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(pad).toHaveCount(0);
  await expect(page.locator(`[data-triage="${PT}"]`)).toContainText('For Hashim!');

  // On a 360 px phone with its text set larger, every key is inside the pad, labels whole.
  const small = await phoneCal(browser, household, { screen: SMALL, init: LARGER_TEXT });
  await small.page.getByRole('button', { name: 'Add event' }).click();
  const smallPad = small.page.locator('.pin-keys');
  await expect(smallPad).toBeVisible();
  const modal = (await small.page.locator('.modal').boundingBox())!;
  for (const b of await smallPad.locator('button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(modal.x);
    expect(box.x + box.width).toBeLessThanOrEqual(modal.x + modal.width);
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  expect(small.errors).toEqual([]);

  // Edit asks for the PIN over the event sheet; the PIN swaps both for the editor, and Back still walks out.
  const locked = await phoneCal(browser, household);
  const lp = locked.page;
  await lp.locator(`[data-event="${READING}"]`).click();
  await lp.locator('.ev-detail').getByRole('button', { name: 'Edit' }).click();
  await expect(lp.locator('.pin-keys')).toBeVisible();
  await backDepth(lp, 3);
  await lp.waitForTimeout(500);
  for (const d of '2468') await lp.locator('.pin-keys').getByRole('button', { name: d, exact: true }).click();
  await expect(lp.locator('.sheet input[name="title"]')).toBeVisible();
  await expect(lp.locator('.ev-detail, .pin-keys')).toHaveCount(0);
  await backDepth(lp, 2);
  await lp.goBack();
  await expect(lp.locator('.sheet')).toHaveCount(0);
  await backDepth(lp, 1);
  await lp.goBack();
  await expect(lp.locator('.ph-head h1')).toHaveText('Today');
  expect(locked.errors).toEqual([]);

  await calTab(paired.page).click();
  await paired.page.locator('.phc-waiting').click();
  await paired.page.locator(`[data-triage="${LIBRARY}"]`).getByRole('button', { name: 'Asiyah', exact: true }).click();
  await expect(paired.page.locator(`[data-triage="${LIBRARY}"]`)).toContainText('For Asiyah');
  await paired.page.goBack();
  await paired.page.getByRole('button', { name: 'Add event' }).click();
  await expect(paired.page.locator('.sheet input[name="title"]')).toBeVisible();
  await expect(paired.page.locator('.pin-keys')).toHaveCount(0);
  expect([...p.errors, ...paired.errors]).toEqual([]);
});

test('a calendar that does not load is named in the status line; the others still show', async ({ browser }) => {
  const household = `phcal-${RUN}-down`;
  await seededWall(browser, household);
  const p = await phoneCal(browser, household, {
    init: `localStorage.setItem('manwar.demoCalendarDown.v1', JSON.stringify(['mamma@demo']))`,
  });
  await expect(p.page.locator('.ph-status')).toContainText("Mamma's calendar not loaded");
  await expect(p.page.locator(`[data-event="${READING}"]`)).toBeVisible();
  await expect(p.page.locator(`[data-event="${PT}"]`)).toHaveCount(0);
  // Back up: it loads, and the line goes.
  await p.page.evaluate(() => localStorage.removeItem('manwar.demoCalendarDown.v1'));
  await p.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(p.page.locator(`[data-event="${PT}"]`)).toHaveCount(1);
  await expect(p.page.locator('.ph-status')).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

test('offline: the agenda stays, an edit fails and keeps the editor, an assignment reaches the wall later, nothing kept on disk', async ({
  browser,
}) => {
  const { w, p } = await pair(browser, 'offline');
  const page = p.page;
  await p.ctx.setOffline(true);
  await expect(page.locator(`[data-event="${READING}"]`)).toBeVisible();
  await page.locator(`[data-event="${DENTIST}"]`).click();
  await page.locator('.ev-detail').getByRole('button', { name: 'Edit' }).click();
  await page.locator('.sheet input[name="title"]').fill('Dentist (moved)');
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.toast')).toContainText('Could not save the event: Could not reach the server.');
  await expect(page.locator('.sheet input[name="title"]')).toHaveValue('Dentist (moved)');
  await expect(page.locator('.sheet').getByRole('button', { name: 'Save' })).toBeEnabled();
  // Online again, the same Save goes through.
  await p.ctx.setOffline(false);
  await page.locator('.sheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator(`[data-event="${DENTIST}"]`)).toContainText('Dentist (moved)');

  // An assignment made offline is the phone's at once and the wall's once it is back.
  await p.ctx.setOffline(true);
  await page.locator('.phc-waiting').click();
  await page.locator(`[data-triage="${PT}"]`).getByRole('button', { name: 'Everyone', exact: true }).click();
  await expect(page.locator(`[data-triage="${PT}"]`)).toContainText('For everyone');
  await expect(calTab(page).locator('.badge')).toHaveText('2');
  await page.waitForTimeout(1500);
  await expect(w.page.locator('.rail .badge')).toHaveText('3');
  await p.ctx.setOffline(false);
  await expect(w.page.locator('.rail .badge')).toHaveText('2', { timeout: 30_000 });

  // A phone keeps the events in memory only: none on disk, so with Google out of reach a reload has none to show.
  expect(await page.evaluate(() => localStorage.getItem('manwar.demoEvents.v1'))).toBeNull();
  await page.evaluate(() => localStorage.setItem('manwar.demoCalendarDown.v1', '"all"'));
  await page.reload();
  await calTab(page).click();
  await expect(page.locator('.phc-list')).toContainText('The calendar could not be loaded yet.', { timeout: 30_000 });
  await expect(page.locator(`[data-event="${READING}"]`)).toHaveCount(0);
  expect([...w.errors, ...p.errors].filter((e) => !/Failed to fetch|ERR_INTERNET/.test(e))).toEqual([]);
});

/** Two taps on one spot as a finger makes them: the second comes a moment after the first. */
async function doubleTap(page: Page, target: { x: number; y: number } | ReturnType<Page['locator']>, gapMs = 130) {
  let at = target as { x: number; y: number };
  if (!('x' in target)) {
    const b = (await target.boundingBox())!;
    at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(gapMs);
  await page.mouse.click(at.x, at.y);
}

test('a double tap opens a sheet or view and presses nothing in it', async ({ browser }) => {
  const { p } = await pair(browser, 'dbl-open');
  const page = p.page;
  const sheet = page.locator('.ev-detail');
  // Where the Dentist sheet puts its location (a link to maps)...
  const dentist = page.locator(`[data-event="${DENTIST}"]`);
  await dentist.click();
  // (once it has slid up)
  await page.waitForTimeout(500);
  const t = (await sheet.locator('.evd-loc').boundingBox())!;
  const at = { x: t.x + 10, y: t.y + t.height / 2 };
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  // ...is where its row is, double-tapped: the sheet opens and maps do not.
  await page.locator('.phc-list').evaluate((el, y) => {
    const row = el.querySelector('[data-event="family@demo::dentist"]')!.getBoundingClientRect();
    el.scrollTop += row.top + row.height / 2 - y;
  }, at.y);
  const row = (await dentist.boundingBox())!;
  expect(Math.abs(row.y + row.height / 2 - at.y)).toBeLessThan(4);
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-event]'), at)).toBe(true);
  await doubleTap(page, at);
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600);
  expect(p.ctx.pages()).toHaveLength(1);
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0);

  // The header +: the editor opens full screen with its X right there; it stays open.
  await doubleTap(page, page.getByRole('button', { name: 'Add event' }));
  await page.waitForTimeout(600);
  await expect(page.locator('.sheet input[name="title"]')).toBeVisible();
  await page.locator('.sheet').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);

  // To assign: the second tap lands on its first event, which neither opens nor gets assigned.
  await doubleTap(page, page.locator('.phc-waiting'));
  await expect(page.locator('.ph-head h1')).toHaveText('To assign');
  await page.waitForTimeout(600);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.phc-tri .phc-chip.on')).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

test('a tap while a sheet is opening reaches what it is aimed at', async ({ browser }) => {
  const { p } = await pair(browser, 'opening');
  const page = p.page;
  const reading = page.locator(`[data-event="${READING}"]`);
  // Where the event sheet's Edit button and the editor's title field end up.
  await reading.click();
  await page.waitForTimeout(500);
  const edit = (await page.locator('.ev-detail').getByRole('button', { name: 'Edit' }).boundingBox())!;
  await page.locator('.ev-detail').getByRole('button', { name: 'Edit' }).click();
  await page.waitForTimeout(500);
  const title = (await page.locator('.sheet input[name="title"]').boundingBox())!;
  await page.locator('.sheet').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await backDepth(page, 1);
  // A tap on Edit 60 ms after the sheet began to open opens the editor.
  await reading.click();
  await page.waitForTimeout(60);
  await page.mouse.click(edit.x + edit.width / 2, edit.y + edit.height / 2);
  await expect(page.locator('.sheet input[name="title"]')).toBeVisible();
  // A tap in the title field just as the editor opens lands in it. (The + sits under the X: a tap there
  // within the double-tap time of the one that closed the editor is the rest of that double tap.)
  await page.locator('.sheet').getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Add event' }).click();
  await page.waitForTimeout(60);
  await page.mouse.click(title.x + 30, title.y + title.height / 2);
  await page.waitForTimeout(400);
  await expect(page.locator('.sheet input[name="title"]')).toBeFocused();
  expect(p.errors).toEqual([]);
});

test('at midnight the agenda moves on, keeps the day looked at in place, and + follows', async ({ browser }) => {
  const household = `phcal-${RUN}-midnight`;
  const now = 'now=2026-11-04T23:59:40';
  await seededWall(browser, household, now);
  const p = await phoneCal(browser, household, { now });
  const page = p.page;
  await expect(day(page, '2026-11-04').locator('.phc-day-name')).toHaveText('Today');
  // Looking at Friday when the day changes.
  await day(page, '2026-11-06').evaluate((el) => el.scrollIntoView());
  const top = () =>
    page.locator('.phc-list').evaluate((el) => {
      const y = el.getBoundingClientRect().top;
      return [...el.querySelectorAll<HTMLElement>('[data-day]')].find((s) => s.getBoundingClientRect().bottom > y + 2)?.dataset
        .day;
    });
  expect(await top()).toBe('2026-11-06');
  await expect(day(page, '2026-11-05').locator('.phc-day-name')).toHaveText('Today', { timeout: 40_000 });
  await expect(day(page, '2026-11-04')).toHaveCount(0);
  await expect(day(page, '2026-11-06').locator('.phc-day-name')).toHaveText('Tomorrow');
  expect(await top()).toBe('2026-11-06');
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect(page.locator('.sheet input[name="startDate"]')).toHaveValue('2026-11-06');
  // (a tap on X right where + was, at once, would be the rest of a double tap)
  await page.waitForTimeout(500);
  await page.locator('.sheet').getByRole('button', { name: 'Close' }).click();
  // Back at the top, + adds on the new today.
  await page.locator('.phc-today').click();
  await expect(page.locator('.phc-today')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add event' }).click();
  await expect(page.locator('.sheet input[name="startDate"]')).toHaveValue('2026-11-05');
  expect(p.errors).toEqual([]);
});

test('a reload with a sheet open comes back on the agenda without it, and Back still walks out one step at a time', async ({
  browser,
}) => {
  const { p } = await pair(browser, 'reload');
  const page = p.page;
  await page.locator(`[data-event="${READING}"]`).click();
  await page.locator('.ev-detail').getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.sheet')).toBeVisible();
  await backDepth(page, 2);
  await page.reload();
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  await expect(page.locator('.sheet, .ev-detail')).toHaveCount(0);
  await backDepth(page, 1);
  await page.locator(`[data-event="${READING}"]`).click();
  await expect(page.locator('.ev-detail')).toBeVisible();
  await backDepth(page, 2);
  await page.goBack();
  await expect(page.locator('.ev-detail')).toHaveCount(0);
  await backDepth(page, 1);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  expect(p.errors).toEqual([]);
});

test('scrolling far ahead and back keeps the agenda whole and quick', async ({ browser }) => {
  const { p } = await pair(browser, 'far');
  const page = p.page;
  const list = page.locator('.phc-list');
  // Down past the loaded four months: each stretch is fetched before it shows.
  for (let i = 0; i < 60 && !(await day(page, '2027-03-20').count()); i++) {
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(150);
  }
  await expect(day(page, '2027-03-20')).toHaveCount(1);
  // Every day between is there once, in order, with its events.
  const days = await page.locator('.phc-list [data-day]').evaluateAll((els) => els.map((e) => e.getAttribute('data-day')!));
  expect(days[0]).toBe('2026-11-04');
  expect([...days].sort()).toEqual(days);
  expect(new Set(days).size).toBe(days.length);
  await expect(page.locator('[data-event="family@demo::reading_20270301"]')).toHaveCount(1);
  await expect(page.locator('.ph-head h1')).toHaveText('March 2027');
  // Back up by hand: the header follows, and the Today button goes once today is at the top.
  for (let i = 0; i < 40 && (await list.evaluate((el) => el.scrollTop)) > 0; i++) {
    await list.evaluate((el) => el.scrollBy(0, -4000));
    await page.waitForTimeout(60);
  }
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  await expect(page.locator('.phc-today')).toHaveCount(0);
  // With months of days drawn, a filter tap redraws them all and stays quick.
  const ms = await page.evaluate(async () => {
    const chip = [...document.querySelectorAll<HTMLElement>('.phc-filter .phc-chip')].find(
      (b) => b.querySelector('bdi')?.textContent === 'Hashim!',
    )!;
    const t0 = performance.now();
    chip.click();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - t0;
  });
  console.log(`filter redraw with ${await page.locator('.phc-ev').count()} rows: ${Math.round(ms)} ms`);
  expect(ms).toBeLessThan(1000);
  expect(p.errors).toEqual([]);
});

test('a busy day opens at its Now line, with today on top and no Today button', async ({ browser }) => {
  const household = `phcal-${RUN}-busy`;
  await seededWall(browser, household);
  const busy = Array.from({ length: 20 }, (_, i) => timed(`busy${i}`, `Busy ${i + 1}`, '2026-11-04', 6 * 60 + i * 45, 40));
  const p = await phoneCal(browser, household, { init: demoCalendar(busy) });
  const page = p.page;
  await expect(page.locator('[data-event="family@demo::busy0"]')).toHaveCount(1);
  // At 11:44 Busy 8 (11:15 - 11:55) is under way; the Now line after it is in the upper half of the list.
  await page.waitForTimeout(500);
  const list = (await page.locator('.phc-list').boundingBox())!;
  const now = (await page.locator('.phc-now').boundingBox())!;
  expect(now.y).toBeGreaterThan(list.y);
  expect(now.y + now.height).toBeLessThan(list.y + list.height / 2 + 20);
  await expect(page.locator('[data-event="family@demo::busy7"]')).toBeInViewport();
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  await expect(page.locator('.phc-today')).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

test('the editor keeps the field being typed in above the on-screen keyboard, Save still in reach', async ({ browser }) => {
  const { p } = await pair(browser, 'keyboard');
  const page = p.page;
  await page.getByRole('button', { name: 'Add event' }).click();
  const sheet = page.locator('.sheet');
  const notes = sheet.locator('textarea[name="notes"]');
  // Notes low on the screen, then tapped: the keyboard takes the bottom 40% of the screen.
  await sheet.locator('.sheet-body').evaluate((body) => {
    const field = body.querySelector('textarea')!;
    body.scrollTop += field.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom + 4;
  });
  await page.waitForTimeout(500);
  await notes.click();
  const full = page.viewportSize()!;
  await page.setViewportSize({ width: full.width, height: Math.round(full.height * 0.6) });
  await page.waitForTimeout(400);
  const box = (await notes.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + 30).toBeLessThanOrEqual(full.height * 0.6);
  await expect(notes).toBeFocused();
  await page.keyboard.type('Bring the forms');
  // The footer sits above the keyboard.
  const save = (await sheet.getByRole('button', { name: 'Add', exact: true }).boundingBox())!;
  expect(save.y + save.height).toBeLessThanOrEqual(full.height * 0.6);
  await page.setViewportSize(full);
  await expect(notes).toHaveValue('Bring the forms');
  expect(p.errors).toEqual([]);
});
