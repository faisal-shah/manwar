import { devices, expect as baseExpect, test, type Page } from '@playwright/test';
import { FS, NOW, newContext, OWNER, phone, wall } from './phone-helpers';
import { RUN, backSettled, chip, phoneAt, phoneTab, wallAndPhone, wallCard, wallStars } from './phone-family';

/*
 * The phone's Today tab: what is on the wall and next on the calendar,
 * everyone's progress, dinner and the countdowns, live from the wall.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

// Every wall and phone a test opened is its own browser context: close them, or a worker holds them all.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

const person = (page: Page, id: string) => page.locator(`.pd-person[data-person="${id}"]`);
const nextUp = (page: Page) => page.getByRole('region', { name: 'Calendar' });
const countdowns = (page: Page) => page.getByRole('region', { name: 'Countdowns' });

/** The household's calendar filter (the wall's), written straight to the emulator. */
async function hideOnWall(household: string, profiles: string[]): Promise<void> {
  const res = await fetch(`${FS}/households/demo-${household}/settings/main?updateMask.fieldPaths=filter.hiddenProfiles`, {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        filter: {
          mapValue: { fields: { hiddenProfiles: { arrayValue: { values: profiles.map((stringValue) => ({ stringValue })) } } } },
        },
      },
    }),
  });
  expect(res.ok, await res.text()).toBe(true);
}

/** On the phone's Calendar tab, tap the people filter's chip for `name`. */
async function tapChip(page: Page, name: string) {
  await phoneTab(page, 'Calendar');
  await page.locator('.phc-filter').getByRole('button', { name, exact: true }).click();
}

test("each person's progress is live, and a tap opens their tasks", async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'today-progress');
  const page = p.page;
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  await expect(page.locator('.pd-date')).toHaveText('Wednesday, Nov 4');
  await expect(person(page, 'mamma')).toContainText('0/6');
  await expect(page.locator('.pd-person', { hasText: 'Up for Grabs' })).toContainText('0/2');
  await wallCard(w.page, 'mamma', 'Reading').locator('.tk-check').click();
  await expect(person(page, 'mamma')).toContainText('1/6');
  await person(page, 'mamma').click();
  await expect(page.locator('.ph-head h1')).toHaveText('Tasks');
  await expect(chip(page, 'mamma')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pt .tk-card[data-task="Reading"]')).toHaveClass(/done/);
  // Up for Grabs opens its chores.
  await phoneTab(page, 'Today');
  await page.locator('.pd-person', { hasText: 'Up for Grabs' }).click();
  await expect(chip(page, '*')).toHaveAttribute('aria-pressed', 'true');
  expect(errors()).toEqual([]);
});

test("the wall's note and running timer show on Today, and leave with them", async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'today-wall');
  const page = p.page;
  await expect(page.locator('.pd-wall')).toHaveCount(0);
  await w.page.locator('.rail button', { hasText: 'Home' }).click();
  await w.page.getByRole('button', { name: 'Message' }).click();
  await w.page.getByRole('textbox', { name: 'Message' }).fill('رجعنا الساعة ٧');
  await w.page.locator('.sheet .picker button', { hasText: 'Mamma' }).click();
  await w.page.getByRole('button', { name: 'Post to the wall' }).click();
  const line = page.locator('.pd-wall');
  await expect(line).toContainText('رجعنا الساعة ٧');
  await expect(line).toContainText('On the wall, from Mamma, just now');
  await expect(line.locator('.pd-note')).toHaveAttribute('dir', 'auto');

  await w.page.getByRole('dialog', { name: 'Message' }).getByRole('button', { name: 'OK!' }).click();
  await expect(line).toHaveCount(0);

  await w.page.getByRole('button', { name: 'Timer' }).click();
  await w.page.locator('.modal').getByRole('button', { name: '5', exact: true }).click();
  await w.page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.pd-wall [role="timer"]')).toContainText(/Wall timer: [45]:\d\d left/);
  await w.page.locator('.timer-close').click();
  await expect(page.locator('.pd-wall')).toHaveCount(0);
  expect(errors()).toEqual([]);
});

test('next up, dinner and the countdowns; tomorrow once today is over', async ({ browser }) => {
  const { household, p, errors } = await wallAndPhone(browser, 'today-cal');
  const page = p.page;
  const next = page.getByRole('region', { name: 'Calendar' });
  await expect(next.locator('.pd-day-label')).toHaveText(['Today']);
  await expect(next.locator('.pd-ev').first()).toContainText('Now');
  await expect(page.getByRole('region', { name: 'Dinner' })).toContainText('Chicken biryani');
  await expect(page.getByRole('region', { name: 'Countdowns' }).locator('.pd-cd').first()).toContainText('days');

  // Ingredients go to the grocery list from here.
  await page.getByRole('region', { name: 'Dinner' }).getByRole('button', { name: 'Ingredients' }).click();
  await expect(page.getByRole('dialog').first()).toContainText('basmati rice');
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Late in the evening nothing timed is left today: tomorrow shows too.
  const late = await phoneAt(browser, household, '2026-11-04T23:30');
  const lateNext = late.page.getByRole('region', { name: 'Calendar' });
  await expect(lateNext.locator('.pd-day-label')).toContainText(['Tomorrow']);
  await expect(lateNext.locator('.pd-day').last().locator('.pd-ev').first()).toBeVisible();
  expect([...errors(), ...late.errors]).toEqual([]);
});

test('a new household offers to add people', async ({ browser }) => {
  const household = `phtasks-${RUN}-today-empty`;
  const w = await wall(browser, household, '&seed=none');
  await expect(w.page.locator('.rail')).toBeVisible();
  const p = await phone(browser, household, '&seed=none');
  const page = p.page;
  await expect(page.getByRole('region', { name: 'Tasks today' })).toContainText('No people yet. Add a person');
  await phoneTab(page, 'Tasks');
  await expect(page.locator('.pt')).toContainText('No people yet');
  // Adding a task still works (Up for Grabs needs nobody).
  await page.getByRole('button', { name: 'Add task' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add task' });
  await sheet.getByLabel('Title', { exact: true }).fill('Sweep the porch');
  await sheet.getByRole('switch', { name: 'Up for Grabs' }).click();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.pt .tk-card[data-task="Sweep the porch"]')).toBeVisible();
  await phoneTab(page, 'More');
  await page.getByRole('button', { name: /Stars and rewards/ }).click();
  await expect(page.getByRole('region', { name: 'Stars' })).toContainText('No people yet');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test("Today shows what the Calendar tab's people filter shows, not the wall's filter", async ({ browser }) => {
  const household = `phtasks-${RUN}-today-filter`;
  const w = await wall(browser, household);
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(wallStars(w.page, 'asiyah')).toHaveText('128', { timeout: 30_000 });
  // The wall hides Hashim's events before the phone opens: the phone has the household's filter from the start.
  await hideOnWall(household, ['hashim']);
  const p = await phone(browser, household);
  const page = p.page;
  await tapChip(page, 'Hashim!');
  await expect(page.locator('[data-event="family@demo::nap_20261104"]')).toBeVisible();
  await expect(page.locator('[data-event="family@demo::reading_20261104"]')).toHaveCount(0);
  await phoneTab(page, 'Today');
  // Hashim's nap comes first: Asiyah's lessons before it are not his.
  await expect(nextUp(page).locator('.pd-ev').first()).toContainText('Nap');
  await expect(nextUp(page)).not.toContainText('Reading');
  await expect(countdowns(page).locator('.pd-cd-title')).toHaveText(["Hashim's birthday", 'Camping trip']);
  // Asiyah instead: her lessons, and the family's trip, not Hashim's birthday.
  await tapChip(page, 'Hashim!');
  await tapChip(page, 'Asiyah');
  await phoneTab(page, 'Today');
  await expect(nextUp(page).locator('.pd-ev').first()).toContainText('Reading');
  await expect(countdowns(page).locator('.pd-cd-title')).toHaveText(['Camping trip']);
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('Next up says the calendar could not be loaded, until it loads', async ({ browser }) => {
  const household = `phtasks-${RUN}-today-down`;
  const w = await wall(browser, household, '&seed=none');
  const page = await (await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' })).newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('manwar.demoCalendarDown.v1', '"all"'));
  await page.goto(`/?demo=${household}&layout=phone&${NOW}`);
  await expect(page.locator('.ph-status')).toContainText('not loaded', { timeout: 30_000 });
  await expect(nextUp(page).getByRole('status')).toHaveText('The calendar could not be loaded yet.');
  await expect(nextUp(page)).not.toContainText('Nothing else');
  // Reachable again: the events come in.
  await page.evaluate(() => {
    localStorage.removeItem('manwar.demoCalendarDown.v1');
    window.dispatchEvent(new Event('online'));
  });
  await expect(nextUp(page).locator('.pd-ev').first()).toBeVisible();
  await expect(nextUp(page).getByRole('status')).toHaveCount(0);
  expect([...w.errors, ...errors]).toEqual([]);
});

test("Plan dinner on Today opens tonight's plan sheet in More > Meals", async ({ browser }) => {
  const household = `phtasks-${RUN}-today-plan`;
  const w = await wall(browser, household, '&seed=none');
  const p = await phone(browser, household, '&seed=none');
  const page = p.page;
  const dinner = page.getByRole('region', { name: 'Dinner' });
  await expect(dinner).toContainText('Nothing planned.');
  await expect(dinner).not.toContainText('at the wall');
  await dinner.getByRole('button', { name: 'Plan dinner' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('Meals');
  const sheet = page.getByRole('dialog', { name: 'Plan meal' });
  await expect(sheet).toContainText('Wednesday, Nov 4');
  await expect(sheet.getByRole('radio', { name: 'Dinner' })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(500);
  await sheet.getByPlaceholder('Tacos').fill('Tacos');
  await sheet.getByRole('button', { name: 'Plan meal' }).click();
  await expect(page.locator('.pm-tonight')).toContainText('Tacos');
  // Back: More, then Today, which shows it.
  await backSettled(page, 2);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('More');
  await backSettled(page, 1);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  await expect(dinner).toContainText('Tacos');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('an event tapped on Today opens its details on the Calendar tab; Back closes them, then returns', async ({ browser }) => {
  const { p, errors } = await wallAndPhone(browser, 'today-event');
  const page = p.page;
  const reading = nextUp(page).locator('.pd-ev', { hasText: 'Reading' });
  await reading.click();
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  const detail = page.locator('.ev-detail[data-detail="family@demo::reading_20261104"]');
  await expect(detail).toBeVisible();
  // The details are one level, the Calendar tab another, as for an event tapped on the Calendar tab.
  await backSettled(page, 2);
  await page.goBack();
  await expect(detail).toHaveCount(0);
  await expect(page.locator('.ph-head h1')).toHaveText('November');
  await backSettled(page, 1);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  // See all still opens the agenda alone.
  await nextUp(page).getByRole('button', { name: 'See all' }).click();
  await expect(page.locator('.phc-list')).toBeVisible();
  await expect(page.locator('.ev-detail')).toHaveCount(0);
  expect(errors()).toEqual([]);
});
