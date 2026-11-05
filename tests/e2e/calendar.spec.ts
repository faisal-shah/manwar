import { expect, test, type Page } from '@playwright/test';

// Each test gets its own demo household so reruns and parallel tests start from fresh data.
const RUN = Date.now().toString(36);
let seq = 0;

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=e2e-cal-${RUN}-${++seq}&now=2026-11-04T11:44`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.cal-body[data-view="schedule"]')).toBeVisible();
  // Demo events come from the fake source asynchronously.
  await expect(page.locator('[data-event="family@demo::reading_20261104"]')).toBeVisible();
  return errors;
}

async function pickView(page: Page, label: string) {
  await page.locator('.cal-view-btn').click();
  await page.getByRole('menuitemradio', { name: label }).click();
}

const title = (page: Page) => page.locator('.topbar .when > span').first();

test('switches between the four views', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('.sched-day')).toHaveCount(4);
  await expect(page.locator('.sched-day').first()).toContainText('Wed');
  await expect(page.locator('.now-line')).toHaveCount(1);

  await pickView(page, 'Week');
  await expect(page.locator('.cal-body')).toHaveAttribute('data-view', 'week');
  await expect(page.locator('.cal-week-cell')).toHaveCount(8);
  await expect(page.locator('.cal-week-next')).toContainText('November 8 - 14');
  await expect(page.locator('.cal-week-cell[data-day="2026-11-04"] .cal-week-count')).toContainText('events today');

  await pickView(page, 'Month');
  await expect(page.locator('.month-week')).toHaveCount(5);
  await expect(page.locator('.mcell[data-day="2026-11-01"]')).toContainText('Nov 1');
  await expect(page.locator('.month-more').first()).toContainText('more');

  await pickView(page, 'Day');
  await expect(page.locator('.dayv-head')).toContainText('Today');
  await page.locator('.cal-mini-day', { hasText: /^6$/ }).first().click();
  await expect(page.locator('.dayv-head')).toContainText('Friday, Nov 6');
  await expect(title(page)).toHaveText('Fri, Nov 6, 2026');

  await pickView(page, 'Schedule');
  await expect(page.locator('.sched-day')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('pages across a month and year boundary', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(title(page)).toHaveText('November 2026');
  await expect(page.locator('.sched-day').first()).toHaveText(/Sun\s*8/);
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(title(page)).toHaveText('Wed, Nov 4');

  await pickView(page, 'Month');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(title(page)).toHaveText('December 2026');
  // Swipe left for the next month.
  const box = (await page.locator('.cal-body').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(title(page)).toHaveText('January 2027');
  await expect(page.locator('.month-week')).toHaveCount(6);
  await expect(page.locator('.mcell[data-day="2027-01-01"]')).toContainText('Jan 1');
  // Events load for the new range.
  await expect(page.locator('[data-event="family@demo::handwriting_20270104"]')).toBeVisible();

  await page.getByRole('button', { name: 'Previous' }).click();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(title(page)).toHaveText('Wed, Nov 4');
  expect(errors).toEqual([]);
});

test('opens event details, including a read-only event', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-event="family@demo::quran_20261105"]').click();
  const detail = page.locator('.ev-detail');
  await expect(detail).toContainText('Quran class');
  await expect(detail).toContainText('Thursday, Nov 5 : 1:45 - 2:45 PM');
  await expect(detail).toContainText('Weekly on Thu, Sat');
  await expect(detail).toContainText('Asiyah');
  await expect(detail).toContainText('Hashim!');
  await expect(detail).toContainText('Family');
  await expect(detail.getByRole('button', { name: 'Edit' })).toBeVisible();
  await page.locator('.popover-scrim').click({ position: { x: 5, y: 500 } });
  await expect(detail).toHaveCount(0);

  await page.locator('[data-event="mamma@demo::pt-meeting"]').click();
  await expect(detail).toContainText('(read-only)');
  await expect(detail).toContainText('Not assigned yet');
  await expect(detail.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Assign' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('creates an event', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.fab').click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toContainText('Add Event');
  await expect(sheet.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await sheet.locator('input[name="title"]').fill('Science fair');
  await sheet.locator('input[name="startDate"]').fill('2026-11-05');
  await sheet.locator('input[name="startTime"]').fill('16:00');
  await expect(sheet.locator('input[name="endTime"]')).toHaveValue('17:00');
  await sheet.locator('.picker button', { hasText: 'Asiyah' }).click();
  // A double tap adds one event.
  await sheet.getByRole('button', { name: 'Add', exact: true }).dblclick();
  await expect(page.locator('.toast')).toContainText('Event added');
  await expect(sheet).toHaveCount(0);
  const block = page.locator('.sched-col[data-day="2026-11-05"] .ev-block', { hasText: 'Science fair' });
  await expect(block).toHaveCount(1);
  await expect(block).not.toHaveClass(/ev-unassigned/);
  await block.click();
  await expect(page.locator('.ev-detail')).toContainText('Asiyah');
  expect(errors).toEqual([]);
});

test('edits one occurrence of a recurring event', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-event="family@demo::math_20261105"]').click();
  await page.locator('.ev-detail').getByRole('button', { name: 'Edit' }).click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toContainText('Edit Event');
  await expect(sheet).toContainText('Weekdays');
  await sheet.locator('input[name="title"]').fill('Math test');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.modal').getByRole('button', { name: 'This event', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Event saved');
  await expect(page.locator('[data-event="family@demo::math_20261105"]')).toContainText('Math test');
  await expect(page.locator('[data-event="family@demo::math_20261106"]')).toContainText('Math');
  await expect(page.locator('[data-event="family@demo::math_20261106"]')).not.toContainText('Math test');
  await expect(page.locator('[data-event="family@demo::math_20261104"]')).not.toContainText('Math test');
  expect(errors).toEqual([]);
});

test('assigns events from the triage queue', async ({ page }) => {
  const errors = await open(page);
  const btn = page.locator('.triage-btn');
  await expect(btn.locator('.triage-count')).toHaveText('3');
  await expect(page.locator('[data-event="mamma@demo::pt-meeting"]')).toHaveClass(/ev-unassigned/);
  await btn.click();
  const sheet = page.locator('.sheet');
  await expect(sheet.locator('.triage-row')).toHaveCount(3);

  const row = sheet.locator('.triage-row', { hasText: 'Parent-teacher meeting' });
  await expect(row.getByRole('button', { name: 'Assign' })).toBeDisabled();
  await row.locator('.picker button', { hasText: 'Mamma' }).click();
  await row.locator('.picker button', { hasText: 'Baba' }).click();
  await row.getByRole('button', { name: 'Assign' }).click();
  await expect(sheet.locator('.triage-row')).toHaveCount(2);
  await expect(btn.locator('.triage-count')).toHaveText('2');

  await sheet.locator('.triage-row', { hasText: 'Library storytime' }).getByRole('button', { name: 'Skip for now' }).click();
  await expect(sheet.locator('.triage-row')).toHaveCount(1);
  const last = sheet.locator('.triage-row', { hasText: 'Book club' });
  await last.locator('.picker button', { hasText: 'Everyone' }).click();
  await last.getByRole('button', { name: 'Assign' }).click();
  await expect(sheet).toContainText('1 skipped for now.');
  await page.locator('.sheet-head').getByRole('button', { name: 'Close' }).click();

  const pt = page.locator('[data-event="mamma@demo::pt-meeting"]');
  await expect(pt).not.toHaveClass(/ev-unassigned/);
  await pt.click();
  await expect(page.locator('.ev-detail')).toContainText('Mamma');
  await expect(page.locator('.ev-detail')).toContainText('Baba');
  expect(errors).toEqual([]);
});

test('filters profiles, events and the progress cal-strip', async ({ page }) => {
  const errors = await open(page);
  const prep = page.locator('[data-event="family@demo::prep-dinner_20261104"]');
  const playdate = page.locator('[data-event="family@demo::playdate"]');
  await expect(prep).toBeVisible();
  await expect(page.locator('.cal-prog', { hasText: 'Mamma' })).toBeVisible();
  await page.locator('.cal-filter-btn').click();
  const menu = page.locator('.cal-menu');
  await menu.locator('.cal-filter-row', { hasText: 'Mamma' }).getByRole('switch').click();
  await expect(prep).toHaveCount(0);
  // Shared events stay while any of their profiles is shown.
  await expect(playdate).toBeVisible();
  await expect(page.locator('.cal-prog', { hasText: 'Mamma' })).toHaveCount(0);
  await menu.locator('.cal-filter-row', { hasText: 'Meals' }).getByRole('switch').click();
  await expect(page.locator('.sched-allday .cal-meal')).toHaveCount(0);
  await menu.locator('.cal-filter-row', { hasText: 'Select All' }).getByRole('switch').click();
  await expect(prep).toBeVisible();
  expect(errors).toEqual([]);
});

test('deletes an event, toggles a countdown, and prefills the day from Week', async ({ page }) => {
  const errors = await open(page);
  const dentist = page.locator('[data-event="family@demo::dentist"]');
  await dentist.click();
  await page.locator('.evd-toggle').getByRole('switch').click();
  await expect(page.locator('.cal-cd')).toContainText('Dentist');
  await expect(page.locator('.cal-cd')).toContainText('2 days');
  await expect(page.locator('.ev-detail')).toContainText('2 days until event');
  await page.locator('.ev-detail').getByRole('button', { name: 'Delete' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.toast')).toContainText('Event deleted');
  await expect(dentist).toHaveCount(0);
  await expect(page.locator('.cal-cd')).toContainText("Hashim's birthday");

  await pickView(page, 'Week');
  await page.locator('.cal-week-cell[data-day="2026-11-06"] .cal-week-add').click();
  await expect(page.locator('.sheet input[name="startDate"]')).toHaveValue('2026-11-06');
  await expect(page.locator('.sheet input[name="startTime"]')).toHaveValue('09:00');
  expect(errors).toEqual([]);
});

/** Add a timed event through the editor (Asiyah, Family calendar). */
async function addEvent(page: Page, title: string, date: string, start: string, end: string) {
  await page.locator('.fab').click();
  const sheet = page.locator('.sheet');
  await sheet.locator('input[name="title"]').fill(title);
  await sheet.locator('input[name="startDate"]').fill(date);
  await sheet.locator('input[name="startTime"]').fill(start);
  await sheet.locator('input[name="endTime"]').fill(end);
  await sheet.locator('.picker button', { hasText: 'Asiyah' }).click();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toHaveCount(0);
}

test('an end time set past midnight and back again keeps the event on its day', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.fab').click();
  const sheet = page.locator('.sheet');
  await sheet.locator('input[name="title"]').fill('Late call');
  await sheet.locator('input[name="startDate"]').fill('2026-11-05');
  await sheet.locator('input[name="startTime"]').fill('23:00');
  await sheet.locator('input[name="endTime"]').fill('01:00');
  await expect(sheet.locator('input[name="endDate"]')).toHaveValue('2026-11-06');
  await sheet.locator('input[name="endTime"]').fill('23:45');
  await expect(sheet.locator('input[name="endDate"]')).toHaveValue('2026-11-05');
  await sheet.locator('.picker button', { hasText: 'Asiyah' }).click();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.sched-col[data-day="2026-11-05"] .ev-block', { hasText: 'Late call' })).toContainText(
    '11 - 11:45 PM',
  );
  await expect(page.locator('.sched-col[data-day="2026-11-06"] .ev-block', { hasText: 'Late call' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('keeps an event card on screen when its profile picker opens near the bottom', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-event="family@demo::isha_20261107"]').click();
  await page.locator('.ev-detail').getByRole('button', { name: 'Change' }).click();
  const save = page.locator('.ev-detail').getByRole('button', { name: 'Save' });
  await expect(save).toBeVisible();
  const bottom = async () => {
    const b = (await page.locator('.popover').boundingBox())!;
    return b.y + b.height;
  };
  await expect.poll(bottom).toBeLessThanOrEqual(1000);
  await expect(save).toBeInViewport({ ratio: 1 });
  expect(errors).toEqual([]);
});

test('keeps Edit and Delete in reach for a title with a long link in it', async ({ page }) => {
  const errors = await open(page);
  const title = 'Zoom: https://us02web.zoom.us/j/81234567890?pwd=QWxhZGRpbjpvcGVuIHNlc2FtZQ_and_more';
  await addEvent(page, title, '2026-11-05', '16:00', '17:00');
  await page.locator('.sched-col[data-day="2026-11-05"] .ev-block', { hasText: 'Zoom' }).click();
  const card = (await page.locator('.popover').boundingBox())!;
  for (const name of ['Edit', 'Delete']) {
    const b = (await page.locator('.ev-detail').getByRole('button', { name }).boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(card.x + card.width);
  }
  expect(errors).toEqual([]);
});

test('reads Arabic titles from their start', async ({ page }) => {
  const errors = await open(page);
  await addEvent(page, 'درس القرآن الكريم مع الشيخ عبد الله في المسجد', '2026-11-05', '16:00', '17:00');
  const t = page.locator('.sched-col[data-day="2026-11-05"] .ev-block .ev-title', { hasText: 'درس' });
  await expect(t).toBeVisible();
  // Right to left, so a clipped title loses its end, not its beginning.
  expect(await t.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  expect(
    await page
      .locator('.ev-title', { hasText: 'Math' })
      .first()
      .evaluate((el) => getComputedStyle(el).direction),
  ).toBe('ltr');
  expect(errors).toEqual([]);
});

test('draws an overnight event on both of its days in Month', async ({ page }) => {
  // A sparse demo calendar, so neither day folds the event into "N more".
  const timed = (id: string, title: string, day: string, startMin: number, durMin: number) => ({
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
  });
  await page.addInitScript(
    (ms) => localStorage.setItem('manwar.demoCalendar.v1', JSON.stringify(ms)),
    [timed('night', 'Night shift', '2026-11-10', 22 * 60, 4 * 60), timed('dentist', 'Dentist', '2026-11-11', 9 * 60, 60)],
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/?demo=e2e-cal-${RUN}-${++seq}&now=2026-11-04T11:44`);
  await pickView(page, 'Month');
  const items = page.locator('.month-week').nth(1).locator('.month-item', { hasText: 'Night shift' });
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('10 PM');
  await expect(items.nth(1)).toContainText('until 2 AM');
  // Re-render in place (meals filter) and both pills stay.
  await page.locator('.cal-filter-btn').click();
  await page.locator('.cal-menu .cal-filter-row', { hasText: 'Meals' }).getByRole('switch').click();
  await expect(items).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('a changed repeat rule applies to the series, not one occurrence', async ({ page }) => {
  const errors = await open(page);
  await page.locator('[data-event="family@demo::swim_20261107"]').click();
  await page.locator('.ev-detail').getByRole('button', { name: 'Edit' }).click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toContainText('Weekly on Saturday');
  await sheet.getByRole('tab', { name: 'Daily' }).click();
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  const modal = page.locator('.modal');
  await expect(modal.getByRole('button', { name: 'All events' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'This event', exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'All events' }).click();
  await expect(page.locator('.toast')).toContainText('Event saved');
  // Daily from the first lesson (Sat Nov 7) on: Sunday has one now.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('[data-event="family@demo::swim_20261108"]')).toBeVisible();
  await expect(page.locator('[data-event="family@demo::swim_20261109"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keeps the event counts whole in the narrow Week cells on Home', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const errors = await open(page);
  await page.locator('.rail button', { hasText: 'Home' }).click();
  const pane = page.locator('.cal-pane');
  await pane.locator('.cal-view-btn').click();
  await page.getByRole('menuitemradio', { name: 'Week' }).click();
  await expect(pane.locator('.cal-week-cell[data-day="2026-11-04"] .cal-week-count')).toHaveText(/events today/);
  for (const count of await pane.locator('.cal-week-count').all())
    expect(await count.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  // The add button keeps its name for touch and screen readers.
  await expect(pane.getByRole('button', { name: 'Add event' })).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('zooms the schedule hours with Ctrl + wheel', async ({ page }) => {
  const errors = await open(page);
  const grid = page.locator('.sched-grid');
  const before = (await grid.boundingBox())!.height;
  const box = (await page.locator('.sched-scroll').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await grid.boundingBox())!.height).toBeGreaterThan(before * 1.2);
  expect(errors).toEqual([]);
});

/**
 * Real two-finger touch through CDP (the renderer's touch pipeline, as on the
 * tablet). A side-to-side pinch must zoom the hours and must not page.
 */
for (const [name, area] of [
  ['the hour grid', '.sched-scroll'],
  ['the day headers', '.sched-head'],
] as const) {
  test(`pinches the schedule hours from ${name} without paging`, async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      hasTouch: true,
      timezoneId: 'America/Chicago',
    });
    const page = await ctx.newPage();
    const errors = await open(page);
    const grid = page.locator('.sched-grid');
    const days = await page.locator('.sched-head').innerText();
    const before = (await grid.boundingBox())!.height;
    const box = (await page.locator(area).boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + Math.min(box.height / 2, 60);
    const at = (d: number) => [
      { x: cx - d, y: cy, id: 1 },
      { x: cx + d, y: cy, id: 2 },
    ];
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(40)[0]] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(40) });
    for (let d = 40; d <= 90; d += 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(d) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await grid.boundingBox())!.height).toBeGreaterThan(before * 1.5);
    expect(await page.locator('.sched-head').innerText()).toBe(days);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

/** One finger: sideways pages every view, also over its scrolling lists; up and down still scrolls. */
test('pages with a sideways swipe over the scrolling parts of each view', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    hasTouch: true,
    timezoneId: 'America/Chicago',
  });
  const page = await ctx.newPage();
  const errors = await open(page);
  const cdp = await ctx.newCDPSession(page);
  const drag = async (sel: string, dx: number, dy: number) => {
    const box = (await page.locator(sel).first().boundingBox())!;
    const x = box.x + box.width / 2 - dx / 2;
    const y = box.y + Math.min(box.height / 2, 150) - dy / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 10; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10, id: 1 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const body = page.locator('.cal-body');
  const scroller = page.locator('.sched-scroll');
  const top = await scroller.evaluate((el) => el.scrollTop);
  await drag('.sched-scroll', 0, 300);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeLessThan(top - 100);
  await expect(body).toHaveAttribute('data-from', '2026-11-04');
  await drag('.sched-scroll', -500, 0);
  await expect(body).toHaveAttribute('data-from', '2026-11-08');
  await page.getByRole('button', { name: 'Today' }).click();
  await pickView(page, 'Week');
  await drag('.cal-week-items', -500, 0);
  await expect(body).toHaveAttribute('data-from', '2026-11-08');
  await pickView(page, 'Day');
  await drag('.dayv-items', 500, 0);
  await expect(body).toHaveAttribute('data-from', '2026-11-07');
  expect(errors).toEqual([]);
  await ctx.close();
});
