import { expect as baseExpect, test } from '@playwright/test';
import { pairPhone, phone } from './phone-helpers';
import {
  backSettled,
  chip,
  enterPin,
  phoneCard,
  phoneProgress,
  phoneStars,
  phoneTab,
  serverField,
  setPin,
  wallAndPhone,
  wallCard,
  wallStars,
} from './phone-family';

/*
 * The phone's Tasks tab against a wall on the same household: what one
 * checks off shows on the other at once, with the wall's rules and stars.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

// Every wall and phone a test opened is its own browser context: close them, or a worker holds them all.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

test('a check-off on the phone shows on the wall, and the wall one on the phone', async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'live', { tab: 'Tasks' });
  const page = p.page;
  await expect(chip(page, 'asiyah')).toHaveAttribute('aria-pressed', 'true');
  await expect(phoneStars(page)).toHaveText('128');
  await expect(phoneProgress(page)).toHaveText('0/11');

  await phoneCard(page, 'Breakfast').locator('.tk-check').click();
  await expect(phoneCard(page, 'Breakfast')).toHaveClass(/done/);
  await expect(page.locator('.toast', { hasText: 'Breakfast completed' })).toBeVisible();
  await expect(phoneStars(page)).toHaveText('130');
  await expect(chip(page, 'asiyah')).toContainText('1/11');
  await expect(wallCard(w.page, 'asiyah', 'Breakfast')).toHaveClass(/done/);
  await expect(wallStars(w.page, 'asiyah')).toHaveText('130');

  // The wall unchecks it: the phone follows.
  await wallCard(w.page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await expect(phoneCard(page, 'Breakfast')).not.toHaveClass(/done/);
  await expect(phoneStars(page)).toHaveText('128');
  await expect(phoneProgress(page)).toHaveText('0/11');

  // The wall checks off Mamma's Reading: her chip shows it.
  await wallCard(w.page, 'mamma', 'Reading').locator('.tk-check').click();
  await expect(chip(page, 'mamma')).toContainText('1/6');
  expect(errors()).toEqual([]);
});

test('Up for Grabs asks who did it; the claimer gets the stars and is named', async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'ufg', { tab: 'Tasks' });
  const page = p.page;
  await chip(page, '*').click();
  await expect(page.locator('.pt .pcol-name')).toHaveText('Up for Grabs');
  await phoneCard(page, 'Empty dishwasher').locator('.tk-check').click();
  const who = page.getByRole('dialog', { name: 'Who did it?' });
  await who.getByRole('button', { name: 'Hashim!' }).click();
  await expect(who).toHaveCount(0);
  const done = page.locator('.pt-section', { hasText: 'Done today' });
  await expect(done.locator('.tk-card[data-task="Empty dishwasher"]')).toHaveClass(/done/);
  await expect(done.locator('.tk-card[data-task="Empty dishwasher"]')).toContainText('Hashim!');
  await expect(chip(page, '*')).toContainText('1/2');
  await expect(page.locator('.toast', { hasText: 'Empty dishwasher completed by Hashim!' })).toBeVisible();
  await expect(wallCard(w.page, 'hashim', 'Empty dishwasher')).toHaveClass(/done/);
  await expect(wallStars(w.page, 'hashim')).toHaveText('106');

  // Undo from the toast gives it back to everyone.
  await page.locator('.toast', { hasText: 'Empty dishwasher completed' }).getByRole('button', { name: 'Undo' }).click();
  await expect(done).toHaveCount(0);
  await expect(wallStars(w.page, 'hashim')).toHaveText('96');
  await expect(wallCard(w.page, '*', 'Empty dishwasher')).not.toHaveClass(/done/);
  expect(errors()).toEqual([]);
});

test('skipping from the details sheet, Undo, and Back closing the sheet', async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'skip', { tab: 'Tasks' });
  const page = p.page;
  const fish = phoneCard(page, 'Feed the fish');
  await expect(fish).toContainText('2 days late');
  await fish.locator('.tk-body').click();
  const details = page.getByTestId('task-details');
  await expect(details).toContainText('Weekly on Mon, Thu');
  // Back closes the details, and the list stays on the Tasks tab.
  await backSettled(page, 2);
  await page.goBack();
  await expect(details).toHaveCount(0);
  await expect(page.locator('.ph-head h1')).toHaveText('Tasks');

  await fish.locator('.tk-body').click();
  await details.getByRole('button', { name: 'Skip' }).click();
  await expect(fish).toHaveClass(/skipped/);
  await expect(phoneProgress(page)).toHaveText('0/10');
  await expect(wallCard(w.page, 'asiyah', 'Feed the fish')).toHaveClass(/skipped/);
  await page.locator('.toast', { hasText: 'Feed the fish skipped' }).getByRole('button', { name: 'Undo' }).click();
  await expect(fish).not.toHaveClass(/skipped/);
  await expect(wallCard(w.page, 'asiyah', 'Feed the fish')).not.toHaveClass(/skipped/);
  // Back from the Tasks tab goes to Today.
  await backSettled(page, 1);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  expect(errors()).toEqual([]);
});

test('the person picked is remembered, and a deleted one falls back to the first', async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'person', { tab: 'Tasks' });
  const page = p.page;
  await chip(page, 'mamma').click();
  await expect(page.locator('.pt .pcol-name')).toHaveText('Mamma');
  await page.reload();
  await phoneTab(page, 'Tasks');
  await expect(chip(page, 'mamma')).toHaveAttribute('aria-pressed', 'true');
  await expect(phoneCard(page, 'Reading')).toBeVisible();
  await phoneCard(page, 'Reading').locator('.tk-body').click();
  await expect(page.getByTestId('task-details')).toBeVisible();

  // Deleted at the wall while the phone shows her (and one of her tasks).
  await w.page.locator('.rail button', { hasText: 'Settings' }).click();
  await w.page.locator('.set-menu button', { hasText: /^Profiles$/ }).click();
  await w.page.getByRole('button', { name: 'Edit Mamma' }).click();
  await w.page.getByRole('button', { name: 'Delete', exact: true }).click();
  await w.page.getByRole('button', { name: 'Delete profile' }).click();
  await expect(chip(page, 'mamma')).toHaveCount(0);
  await expect(page.getByTestId('task-details')).toHaveCount(0);
  await expect(chip(page, 'asiyah')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pt .pcol-name')).toHaveText('Asiyah');
  expect(errors()).toEqual([]);
});

test("a task deleted from the phone's details leaves the wall, and Undo brings it back", async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'delete', { tab: 'Tasks' });
  const page = p.page;
  await phoneCard(page, 'Reading').locator('.tk-body').click();
  await page.getByTestId('task-details').getByRole('button', { name: 'Delete task' }).click();
  await page.getByRole('dialog', { name: 'Delete "Reading"?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('task-details')).toHaveCount(0);
  await expect(phoneCard(page, 'Reading')).toHaveCount(0);
  await expect(wallCard(w.page, 'asiyah', 'Reading')).toHaveCount(0);
  await expect(wallCard(w.page, 'mamma', 'Reading')).toHaveCount(0);
  await page.locator('.toast', { hasText: 'Deleted "Reading"' }).getByRole('button', { name: 'Undo' }).click();
  await expect(phoneCard(page, 'Reading')).toBeVisible();
  await expect(wallCard(w.page, 'mamma', 'Reading')).toBeVisible();
  await backSettled(page, 1);
  expect(errors()).toEqual([]);
});

test('a task deleted on the wall while the phone shows its details closes them', async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'gone', { tab: 'Tasks' });
  const page = p.page;
  await phoneCard(page, 'Get Ready').locator('.tk-body').click();
  await expect(page.getByTestId('task-details')).toBeVisible();
  await wallCard(w.page, 'asiyah', 'Get Ready').locator('.tk-body').click();
  await w.page.getByRole('button', { name: 'Delete task' }).click();
  await w.page.getByRole('dialog', { name: 'Delete "Get Ready"?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('task-details')).toHaveCount(0);
  await expect(phoneCard(page, 'Get Ready')).toHaveCount(0);
  await expect(phoneProgress(page)).toHaveText('0/10');
  // Its history entry was given back: Back now leaves the Tasks tab, not a ghost sheet.
  await backSettled(page, 1);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  expect(errors()).toEqual([]);
});

test('two phones on one task: the second sees it done and the stars are given once', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'two', { tab: 'Tasks' });
  const q = await phone(browser, household);
  await phoneTab(q.page, 'Tasks');
  await phoneCard(p.page, 'Brush teeth').first().locator('.tk-check').click();
  await expect(phoneCard(q.page, 'Brush teeth').first()).toHaveClass(/done/);
  await expect(phoneStars(q.page)).toHaveText('130');
  await expect(wallStars(w.page, 'asiyah')).toHaveText('130');
  // The second phone unchecks it: once, on every screen.
  await phoneCard(q.page, 'Brush teeth').first().locator('.tk-check').click();
  await expect(phoneCard(p.page, 'Brush teeth').first()).not.toHaveClass(/done/);
  await expect(phoneStars(p.page)).toHaveText('128');
  await expect(wallStars(w.page, 'asiyah')).toHaveText('128');
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'stars')).toBe(128);
  expect([...errors(), ...q.errors]).toEqual([]);
});

test('a check-off made offline shows at once and reaches the wall once back online', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'offline', { tab: 'Tasks' });
  const page = p.page;
  await page.context().setOffline(true);
  await phoneCard(page, 'Breakfast').locator('.tk-check').click();
  await expect(phoneCard(page, 'Breakfast')).toHaveClass(/done/);
  await expect(phoneStars(page)).toHaveText('130');
  await expect(page.locator('.toast', { hasText: 'Breakfast completed' })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(wallCard(w.page, 'asiyah', 'Breakfast')).not.toHaveClass(/done/);
  // The phone keeps it in memory only: it says so until the server has it.
  await expect(page.locator('.ph-status')).toContainText('1 change not sent yet');
  await page.context().setOffline(false);
  await expect(wallCard(w.page, 'asiyah', 'Breakfast')).toHaveClass(/done/, { timeout: 30_000 });
  await expect(page.locator('.ph-status', { hasText: 'not sent yet' })).toHaveCount(0);
  await expect(wallStars(w.page, 'asiyah')).toHaveText('130');
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'stars')).toBe(130);
  // Offline, the browser reports each request it could not make.
  expect(errors().filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});

test('a celebration left by Back is not played on the next visit to Tasks', async ({ browser }) => {
  const { p, errors } = await wallAndPhone(browser, 'celebrate-left', { tab: 'Tasks' });
  const page = p.page;
  const rain = page.locator('.fx-celebrate');
  /** Check off all of `person`'s tasks; Back right after the last one (`during`: once the rain is up). */
  const finishAndLeave = async (person: string, during: boolean) => {
    await chip(page, person).click();
    const open = page.locator('.pt .tk-card:not(.done)');
    await expect(open.first()).toBeVisible();
    // By place, not title: a routine in two sections has two cards.
    for (let left = await open.count(); left > 1; left--) {
      await open.first().locator('.tk-check').click();
      await expect(open).toHaveCount(left - 1);
    }
    await backSettled(page, 1);
    await open.first().locator('.tk-check').click();
    if (during) await expect(rain).toBeVisible();
    await page.goBack();
    await expect(page.locator('.ph-head h1')).toHaveText('Today');
    // Long past the rain's own end, then back to Tasks: nothing plays.
    await page.waitForTimeout(4500);
    await phoneTab(page, 'Tasks');
    await expect(page.locator('.pt .tk-card').first()).toBeVisible();
    for (let t = 0; t < 10; t++) {
      expect(await rain.count(), person).toBe(0);
      await page.waitForTimeout(100);
    }
  };
  // Back in the 450 ms before the rain starts, then Back while it falls.
  await finishAndLeave('baba', false);
  await finishAndLeave('hashim', true);
  expect(errors()).toEqual([]);
});

test('the header + adds a chore, and the details edit it', async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'add', { tab: 'Tasks' });
  const page = p.page;
  await page.getByRole('button', { name: 'Add task' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add task' });
  await sheet.getByLabel('Title', { exact: true }).fill('Fold laundry');
  // Added from Asiyah's list, it starts out hers.
  await expect(sheet.getByRole('button', { name: 'Asiyah' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: 'Mamma' })).toHaveAttribute('aria-pressed', 'false');
  await sheet.getByRole('button', { name: '★ 5' }).click();
  await sheet.getByRole('tab', { name: 'On a schedule' }).click();
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(phoneCard(page, 'Fold laundry')).toContainText('Daily');
  await expect(phoneProgress(page)).toHaveText('0/12');
  await expect(wallCard(w.page, 'asiyah', 'Fold laundry')).toBeVisible();

  await phoneCard(page, 'Fold laundry').locator('.tk-body').click();
  await page.getByRole('button', { name: 'Edit task' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit task' });
  await edit.getByLabel('Title', { exact: true }).fill('Fold the laundry');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toHaveCount(0);
  await expect(phoneCard(page, 'Fold the laundry')).toBeVisible();
  await expect(wallCard(w.page, 'asiyah', 'Fold the laundry')).toBeVisible();
  // Every overlay gave its history entry back: Back leaves the Tasks tab.
  await backSettled(page, 1);

  // From the Up for Grabs list, a new chore is up for grabs.
  await chip(page, '*').click();
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(sheet.getByRole('switch', { name: 'Up for Grabs' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByLabel('Title', { exact: true }).fill('Sweep the porch');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(phoneCard(page, 'Sweep the porch')).toBeVisible();
  await expect(wallCard(w.page, '*', 'Sweep the porch')).toBeVisible();
  expect(errors()).toEqual([]);
});

test('signed in as the wall, the phone asks for the PIN; a paired phone never does', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'pin', { tab: 'Tasks' });
  // Pairing is behind the wall's PIN: pair first, then set it.
  const paired = await pairPhone(browser, w.page, household);
  await setPin(household);
  const page = p.page;
  await page.getByRole('button', { name: 'Add task' }).click();
  await enterPin(page);
  await expect(page.getByRole('dialog', { name: 'Add task' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Add task' }).getByRole('button', { name: 'Close' }).click();
  // Checking off today stays open, as on the wall.
  await phoneCard(page, 'Breakfast').locator('.tk-check').click();
  await expect(phoneCard(page, 'Breakfast')).toHaveClass(/done/);
  await expect(page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);

  await phoneTab(paired.page, 'Tasks');
  await phoneCard(paired.page, 'Feed the fish').locator('.tk-body').click();
  await paired.page.getByTestId('task-details').getByRole('button', { name: 'Skip' }).click();
  await expect(phoneCard(paired.page, 'Feed the fish')).toHaveClass(/skipped/);
  await paired.page.getByRole('button', { name: 'Add task' }).click();
  await expect(paired.page.getByRole('dialog', { name: 'Add task' })).toBeVisible();
  await expect(paired.page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);
  expect([...errors(), ...paired.errors]).toEqual([]);
});
