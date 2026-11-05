import { expect as baseExpect, test } from '@playwright/test';
import { phone, wall } from './phone-helpers';
import { RUN, chip, phoneAt, phoneTab, wallAndPhone, wallCard } from './phone-family';

/*
 * The phone's Today tab: what is on the wall and next on the calendar,
 * everyone's progress, dinner and the countdowns, live from the wall.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

const person = (page: import('@playwright/test').Page, id: string) => page.locator(`.pd-person[data-person="${id}"]`);

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

test('a new household says where people come from', async ({ browser }) => {
  const household = `phtasks-${RUN}-today-empty`;
  const w = await wall(browser, household, '&seed=none');
  await expect(w.page.locator('.rail')).toBeVisible();
  const p = await phone(browser, household, '&seed=none');
  const page = p.page;
  await expect(page.getByRole('region', { name: 'Tasks today' })).toContainText('No people yet. People are added at the wall');
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
