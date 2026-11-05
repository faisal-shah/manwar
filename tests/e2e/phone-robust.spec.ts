import { expect as baseExpect, test, type Page } from '@playwright/test';
import {
  chip,
  phoneAt,
  phoneCard,
  phoneProgress,
  phoneStars,
  phoneTab,
  serverField,
  wallAndPhone,
  wallStars,
} from './phone-family';

/*
 * The phone's Today, Tasks and Stars under rough handling: double taps,
 * Back mid-action, reloads, the day changing, big households.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

/** Sheets slide in and popovers pop in: let them land before measuring a spot in them, and past the opening tap. */
const settle = (page: Page) => page.waitForTimeout(500);

/** A double tap at the middle of `selector`'s box (both taps land on the same spot, as a finger's do). */
async function doubleTap(page: Page, selector: string, dx = 0.5) {
  const box = (await page.locator(selector).first().boundingBox())!;
  await page.mouse.dblclick(box.x + box.width * dx, box.y + box.height / 2);
}

test('a double tap on the header + leaves the editor open', async ({ browser }) => {
  const { p, errors } = await wallAndPhone(browser, 'dbl-add', { tab: 'Tasks' });
  await doubleTap(p.page, '.ph-add');
  await p.page.waitForTimeout(600);
  await expect(p.page.getByRole('dialog', { name: 'Add task' })).toBeVisible();
  expect(errors()).toEqual([]);
});

test("a double tap on a person's row on Today opens their tasks and checks nothing off", async ({ browser }) => {
  const { household, p, errors } = await wallAndPhone(browser, 'dbl-row');
  const page = p.page;
  await expect(page.locator('.pd-person[data-person="asiyah"]')).toContainText('0/11');
  // The count sits at the right, over where the new screen's check circles are.
  await doubleTap(page, '.pd-person[data-person="asiyah"]', 0.95);
  await expect(chip(page, 'asiyah')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(800);
  await expect(page.locator('.pt .tk-card.done')).toHaveCount(0);
  await expect(page.getByTestId('task-details')).toHaveCount(0);
  expect(await serverField(household, 'profiles/asiyah', 'stars')).toBe(128);
  expect(errors()).toEqual([]);
});

test("a double tap on the details' Complete presses nothing under the closed sheet", async ({ browser }) => {
  const { p, errors } = await wallAndPhone(browser, 'dbl-complete', { tab: 'Tasks' });
  const page = p.page;
  // Where Complete sits in the details sheet: over the list's last cards and the tab bar.
  await phoneCard(page, 'Breakfast').locator('.tk-body').click();
  const at = (await page.getByTestId('task-details').getByRole('button', { name: 'Complete' }).boundingBox())!;
  await page.goBack();
  await expect(page.getByTestId('task-details')).toHaveCount(0);
  // Scroll Brush teeth's circle as near that spot as it goes, then double tap other tasks' Complete.
  await page.evaluate(
    (y) => {
      const check = document.querySelector('.pt .tk-card[data-task="Brush teeth"] .tk-check')!.getBoundingClientRect();
      document.querySelector('.ph-body')!.scrollBy(0, check.top + check.height / 2 - y);
    },
    at.y + at.height / 2,
  );
  for (const [title, dx] of [
    ['Get Ready', 0.9],
    ['Change Pull Up', 0.5],
  ] as const) {
    await phoneCard(page, title).first().locator('.tk-body').click();
    await settle(page);
    await doubleTap(page, '[data-testid="task-details"] .btn-primary', dx);
    await expect(phoneCard(page, title).first()).toHaveClass(/done/);
    await page.waitForTimeout(600);
    // The rest of the double tap pressed neither the tab bar nor a card.
    await expect(page.locator('.ph-head h1')).toHaveText('Tasks');
  }
  await expect(page.locator('.pt .tk-card.done')).toHaveCount(2);
  await expect(phoneCard(page, 'Brush teeth').first()).not.toHaveClass(/done/);
  expect(errors()).toEqual([]);
});

test('a double tap on a check circle checks it once, and on Give gives once', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'dbl-check', { tab: 'Tasks' });
  const page = p.page;
  await doubleTap(page, '.pt .tk-card[data-task="Breakfast"] .tk-check');
  await expect(phoneCard(page, 'Breakfast')).toHaveClass(/done/);
  await page.waitForTimeout(800);
  await expect(phoneCard(page, 'Breakfast')).toHaveClass(/done/);
  await expect(wallStars(w.page, 'asiyah')).toHaveText('130');

  await phoneStars(page).click();
  const s = page.getByRole('dialog', { name: /Asiyah.*'s stars/ });
  await settle(page);
  await s.getByRole('button', { name: 'Give', exact: true }).click();
  await settle(page);
  await doubleTap(page, '.hist-adjust .btn-primary');
  await expect(wallStars(w.page, 'asiyah')).toHaveText('135');
  await page.waitForTimeout(800);
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'stars')).toBe(135);
  expect(errors()).toEqual([]);
});

test('a double tap on Redeem spends the stars once', async ({ browser }) => {
  const { household, p, errors } = await wallAndPhone(browser, 'dbl-redeem', { tab: 'Tasks' });
  const page = p.page;
  await phoneStars(page).click();
  await settle(page);
  await doubleTap(page, '.ps-reward[data-reward="Ice cream trip"] .ps-redeem');
  await expect(page.getByRole('dialog', { name: 'Reward redeemed' })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByRole('dialog', { name: 'Reward redeemed' })).toBeVisible();
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'stars')).toBe(78);
  expect(errors()).toEqual([]);
});

test('Back on the PIN pad or a confirmation cancels it and keeps the screen', async ({ browser }) => {
  const { p, errors } = await wallAndPhone(browser, 'back-mid', { tab: 'Tasks' });
  const page = p.page;
  await phoneCard(page, 'Breakfast').locator('.tk-body').click();
  await page.getByRole('button', { name: 'Delete task' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete "Breakfast"?' });
  await expect(confirm).toBeVisible();
  await page.goBack();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByTestId('task-details')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('task-details')).toHaveCount(0);
  await expect(phoneCard(page, 'Breakfast')).toBeVisible();
  await expect(page.locator('.ph-head h1')).toHaveText('Tasks');
  expect(errors()).toEqual([]);
});

test('a reload with a sheet open comes back on Today, and Back still works after', async ({ browser }) => {
  const { p, errors } = await wallAndPhone(browser, 'reload', { tab: 'Tasks' });
  const page = p.page;
  await phoneCard(page, 'Breakfast').locator('.tk-body').click();
  await page.getByRole('button', { name: 'Edit task' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit task' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  await phoneTab(page, 'Tasks');
  await phoneCard(page, 'Breakfast').locator('.tk-body').click();
  await expect(page.getByTestId('task-details')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (history.state as { manwarBack?: number } | null)?.manwarBack)).toBe(2);
  await page.goBack();
  await expect(page.getByTestId('task-details')).toHaveCount(0);
  await expect(page.locator('.ph-head h1')).toHaveText('Tasks');
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  expect(errors()).toEqual([]);
});

test('at midnight the Tasks tab moves to the new day and closes details about the old one', async ({ browser }) => {
  const { household, errors } = await wallAndPhone(browser, 'midnight');
  const late = await phoneAt(browser, household, '2026-11-04T23:59:40');
  const page = late.page;
  await phoneTab(page, 'Tasks');
  await phoneCard(page, 'Pajamas').locator('.tk-check').click();
  await expect(phoneCard(page, 'Pajamas')).toHaveClass(/done/);
  await phoneCard(page, 'Breakfast').locator('.tk-body').click();
  await expect(page.getByTestId('task-details')).toContainText('Wednesday, Nov 4');
  // Thursday: the details close, and the list is Thursday's, nothing done yet.
  await expect(page.getByTestId('task-details')).toHaveCount(0, { timeout: 40_000 });
  await expect(phoneCard(page, 'Pajamas')).not.toHaveClass(/done/);
  await expect(phoneProgress(page)).toHaveText('0/11');
  await phoneTab(page, 'Today');
  await expect(page.locator('.pd-date')).toHaveText('Thursday, Nov 5');
  // Back still leaves the tabs in order.
  await expect.poll(() => page.evaluate(() => (history.state as { manwarBack?: number } | null)?.manwarBack ?? 0)).toBe(0);
  expect([...errors(), ...late.errors]).toEqual([]);
});
