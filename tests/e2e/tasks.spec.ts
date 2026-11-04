import { expect, test, type Page } from '@playwright/test';

const NOW = 'now=2026-11-04T11:44';
const run = `${Date.now().toString(36)}`;

/** Each test gets its own freshly seeded demo household. */
async function openTasks(page: Page, name: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=e2e-tasks-${run}-${name}&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(page.locator('[data-column="asiyah"] .tk-card').first()).toBeVisible({ timeout: 15_000 });
  return errors;
}

const column = (page: Page, id: string) => page.locator(`[data-column="${id}"]`);
const card = (page: Page, col: string, title: string) => column(page, col).locator(`.tk-card[data-task="${title}"]`);
const stars = (page: Page, col: string) => column(page, col).locator('.star-pill');

test('completing and unchecking a task moves the star balance', async ({ page }) => {
  const errors = await openTasks(page, 'check');
  await expect(stars(page, 'asiyah')).toHaveText('128');
  await expect(column(page, 'asiyah').locator('.progress-pill')).toHaveText('0/11');

  await card(page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await expect(card(page, 'asiyah', 'Breakfast')).toHaveClass(/done/);
  await expect(stars(page, 'asiyah')).toHaveText('130');
  await expect(column(page, 'asiyah').locator('.progress-pill')).toHaveText('1/11');
  await expect(page.locator('.toast', { hasText: 'Breakfast completed' })).toBeVisible();

  await card(page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await expect(card(page, 'asiyah', 'Breakfast')).not.toHaveClass(/done/);
  await expect(stars(page, 'asiyah')).toHaveText('128');
  await expect(column(page, 'asiyah').locator('.progress-pill')).toHaveText('0/11');
  expect(errors).toEqual([]);
});

test('a late repeat-after-done chore stays late after check and uncheck', async ({ page }) => {
  await openTasks(page, 'after');
  const sheets = card(page, 'baba', 'Change bed sheets');
  await expect(sheets).toContainText('1 day late');
  await expect(sheets).toContainText('2 weeks after done');
  await sheets.locator('.tk-check').click();
  await expect(sheets).toHaveClass(/done/);
  await expect(sheets).not.toContainText('day late');
  await page.locator('.toast', { hasText: 'Change bed sheets completed' }).getByRole('button', { name: 'Undo' }).click();
  await expect(sheets).not.toHaveClass(/done/);
  await expect(sheets).toContainText('1 day late');
});

test('skipping a late chore from its details, then unskipping it', async ({ page }) => {
  await openTasks(page, 'skip');
  const fish = card(page, 'asiyah', 'Feed the fish');
  await expect(fish).toContainText('2 days late');
  await fish.locator('.tk-body').click();
  const details = page.getByTestId('task-details');
  await expect(details).toContainText('Weekly on Mon, Thu');
  await details.getByRole('button', { name: 'Skip' }).click();
  await expect(fish).toHaveClass(/skipped/);
  await expect(column(page, 'asiyah').locator('.progress-pill')).toHaveText('0/10');

  await fish.locator('.tk-body').click();
  await details.getByRole('button', { name: 'Unskip' }).click();
  await expect(fish).not.toHaveClass(/skipped/);
  await expect(column(page, 'asiyah').locator('.progress-pill')).toHaveText('0/11');
});

test('an Up for Grabs chore goes to whoever did it', async ({ page }) => {
  await openTasks(page, 'ufg');
  await expect(column(page, '*')).toBeVisible();
  await card(page, '*', 'Empty dishwasher').locator('.tk-check').click();
  const dialog = page.getByRole('dialog', { name: 'Who did it?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Hashim!' }).click();

  await expect(card(page, 'hashim', 'Empty dishwasher')).toHaveClass(/done/);
  await expect(card(page, 'hashim', 'Empty dishwasher')).toContainText('Hashim!');
  await expect(stars(page, 'hashim')).toHaveText('106');
  await expect(card(page, '*', 'Empty dishwasher')).toHaveCount(0);
  await expect(column(page, '*').locator('.progress-pill')).toHaveText('0/1');
});

test('a parent adds a chore from the + button', async ({ page }) => {
  await openTasks(page, 'add');
  await page.locator('.fab').click();
  const sheet = page.getByRole('dialog', { name: 'Add task' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByRole('alert')).toHaveText('Give the task a title.');

  await sheet.getByLabel('Title', { exact: true }).fill('Fold laundry');
  await sheet.getByRole('button', { name: 'Asiyah' }).click();
  await sheet.getByRole('button', { name: '★ 5' }).click();
  await sheet.getByRole('switch', { name: 'Due time' }).click();
  await sheet.getByLabel('Time', { exact: true }).fill('16:00');
  await sheet.getByRole('tab', { name: 'On a schedule' }).click();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toHaveCount(0);

  const added = card(page, 'asiyah', 'Fold laundry');
  await expect(added).toBeVisible();
  await expect(added).toContainText('4 PM, Daily');
  await expect(column(page, 'asiyah').locator('.progress-pill')).toHaveText('0/12');
  await added.locator('.tk-check').click();
  await expect(stars(page, 'asiyah')).toHaveText('133');
});

test('undoing a completion from the star history', async ({ page }) => {
  await openTasks(page, 'undo');
  await card(page, 'mamma', 'Reading').locator('.tk-check').click();
  await expect(stars(page, 'mamma')).toHaveText('45');

  await stars(page, 'mamma').click();
  const sheet = page.getByRole('dialog', { name: "Mamma's stars" });
  await expect(sheet).toBeVisible();
  const entry = sheet.locator('.hist-entry[data-reason="task"]', { hasText: 'Reading' });
  await expect(entry).toContainText('+3');
  await entry.getByRole('button', { name: 'Undo Reading' }).click();
  await expect(entry).toHaveClass(/undone/);
  await expect(sheet.locator('.hist-entry[data-reason="untask"]')).toContainText('−3');
  await sheet.getByRole('button', { name: 'Close' }).click();

  await expect(stars(page, 'mamma')).toHaveText('42');
  await expect(card(page, 'mamma', 'Reading')).not.toHaveClass(/done/);
});

test('week view shows a habit grid and paging changes the title', async ({ page }) => {
  await openTasks(page, 'week');
  await card(page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.getByRole('tab', { name: 'Asiyah' }).click();
  const row = page.locator('.wk-task[data-task="Breakfast"]');
  await expect(row.locator('.wk-dot.done')).toHaveCount(1);
  await expect(row.locator('.wk-dot.missed')).toHaveCount(3);
  await expect(page.locator('.wk-day.today')).toContainText('Wed');

  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(page.locator('.topbar .when')).toContainText('Nov 8 - 14');
  await page.getByRole('button', { name: 'This Week' }).click();
  await page.getByRole('tab', { name: 'Day' }).click();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.locator('.topbar .when')).toContainText('Thu, Nov 5');
});
