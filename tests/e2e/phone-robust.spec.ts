import { expect as baseExpect, test, type Page } from '@playwright/test';
import {
  chip,
  enterPin,
  phoneAt,
  phoneCard,
  phoneProgress,
  phoneStars,
  phoneTab,
  serverDocs,
  serverField,
  setPin,
  wallAndPhone,
  wallCard,
  wallStars,
} from './phone-family';
import { phone } from './phone-helpers';

/*
 * The phone's Today, Tasks and Stars under rough handling: double taps,
 * Back mid-action, reloads, the day changing, big households.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

// Every wall and phone a test opened is its own browser context: close them, or a worker holds them all.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

/** Offline, the browser reports each request it could not make. */
const real = (errors: string[]) => errors.filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e));

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

test('a quick tap on the tab bar right after a sheet closes still opens the tab', async ({ browser }) => {
  const { p, errors } = await wallAndPhone(browser, 'quick-tab', { tab: 'Tasks' });
  const page = p.page;
  await page.getByRole('button', { name: 'Add task' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add task' });
  await sheet.getByLabel('Title', { exact: true }).fill('Water the lawn');
  // Add sits over the tab bar's More, and the next tap follows at once.
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await phoneTab(page, 'More');
  await expect(page.locator('.ph-head h1')).toHaveText('More');
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

test("a task deleted at the wall closes the phone's editor; a person deleted closes their stars", async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'gone-open', { tab: 'Tasks' });
  const page = p.page;
  await phoneCard(page, 'Breakfast').locator('.tk-body').click();
  await page.getByRole('button', { name: 'Edit task' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit task' });
  await expect(editor).toBeVisible();
  await w.page.locator('[data-column="asiyah"] .tk-card[data-task="Breakfast"] .tk-body').click();
  await w.page.getByRole('button', { name: 'Delete task' }).click();
  await w.page.getByRole('dialog', { name: 'Delete "Breakfast"?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: '"Breakfast" was deleted on another device.' })).toBeVisible();

  await chip(page, 'hashim').click();
  await phoneStars(page).click();
  const sheet = page.getByRole('dialog', { name: /Hashim!.*'s stars/ });
  await expect(sheet).toBeVisible();
  await w.page.locator('.rail button', { hasText: 'Settings' }).click();
  await w.page.locator('.set-menu button', { hasText: /^Profiles$/ }).click();
  await w.page.getByRole('button', { name: 'Edit Hashim!' }).click();
  await w.page.getByRole('button', { name: 'Delete', exact: true }).click();
  await w.page.getByRole('button', { name: 'Delete profile' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(chip(page, 'asiyah')).toHaveAttribute('aria-pressed', 'true');
  // Both gave their history entries back: only the Tasks tab holds one.
  await expect.poll(() => page.evaluate(() => (history.state as { manwarBack?: number } | null)?.manwarBack ?? 0)).toBe(1);
  expect(errors()).toEqual([]);
});

test('stars given offline on the phone reach the wall once back online, once', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'offline-stars', { tab: 'Tasks' });
  const page = p.page;
  await phoneStars(page).click();
  const s = page.getByRole('dialog', { name: /Asiyah.*'s stars/ });
  await page.context().setOffline(true);
  await s.getByRole('button', { name: 'Give', exact: true }).click();
  await s.getByRole('button', { name: 'Give 5' }).click();
  await expect(s.locator('.ps-num')).toContainText('133');
  await expect(s.locator('.hist-entry[data-reason="give"]').first()).toContainText('+5');
  await page.context().setOffline(false);
  await expect(wallStars(w.page, 'asiyah')).toHaveText('133', { timeout: 30_000 });
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'stars')).toBe(133);
  // Offline, the browser reports each request it could not make.
  expect(errors().filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});

test('a task checked off at the wall while the phone was offline is not awarded again by the phone', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'offline-twice', { tab: 'Tasks' });
  const page = p.page;
  await page.context().setOffline(true);
  await wallCard(w.page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await expect(wallStars(w.page, 'asiyah')).toHaveText('130');
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'stars')).toBe(130);
  // The phone has not heard: it checks Breakfast off too.
  await phoneCard(page, 'Breakfast').locator('.tk-check').click();
  await expect(phoneStars(page)).toHaveText('130');
  await page.context().setOffline(false);
  // The server refuses the phone's whole batch; the phone says so and shows the wall's check-off.
  await expect(
    page.locator('.toast', { hasText: '"Breakfast" was not checked off: another device changed it first.' }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(phoneCard(page, 'Breakfast')).toHaveClass(/done/);
  await expect(phoneStars(page)).toHaveText('130');
  await w.page.waitForTimeout(1500);
  expect(await serverField(household, 'profiles/asiyah', 'stars')).toBe(130);
  await expect(wallStars(w.page, 'asiyah')).toHaveText('130');
  const awards = (await serverDocs(household, 'ledger')).filter((e) => e.reason === 'task' && e.label === 'Breakfast');
  expect(awards).toHaveLength(1);
  expect(real(errors())).toEqual([]);
});

test('a reward redeemed on a phone offline is refused once another device spent the stars', async ({ browser }) => {
  const { household, p, errors } = await wallAndPhone(browser, 'offline-redeem', { tab: 'Tasks' });
  const other = await phone(browser, household);
  const redeemPark = async (page: Page) => {
    await phoneStars(page).click();
    await settle(page);
    await page.locator('.ps-reward[data-reward="Park playdate"] .ps-redeem').click();
    await expect(page.getByRole('dialog', { name: 'Reward redeemed' })).toBeVisible();
  };
  // Asiyah has 128 stars: one Park playdate (75), not two.
  await p.page.context().setOffline(true);
  await redeemPark(p.page);
  await phoneTab(other.page, 'Tasks');
  await redeemPark(other.page);
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'stars')).toBe(53);
  await p.page.context().setOffline(false);
  await expect(
    p.page.locator('.toast', { hasText: '"Park playdate" was not redeemed: another device changed it first.' }),
  ).toBeVisible({
    timeout: 30_000,
  });
  // Nothing to celebrate or undo on the refused phone.
  await expect(p.page.getByRole('dialog', { name: 'Reward redeemed' })).toHaveCount(0);
  await p.page.waitForTimeout(1500);
  expect(await serverField(household, 'profiles/asiyah', 'stars')).toBe(53);
  const spent = (await serverDocs(household, 'ledger')).filter((e) => e.reason === 'redeem' && e.profileId === 'asiyah');
  expect(spent).toHaveLength(1);
  expect(real([...errors(), ...other.errors])).toEqual([]);
});

test('Back on the PIN pad cancels what it asked for', async ({ browser }) => {
  const { household, p, errors } = await wallAndPhone(browser, 'back-pin', { tab: 'Tasks' });
  await setPin(household);
  const page = p.page;
  await phoneCard(page, 'Feed the fish').locator('.tk-body').click();
  await page.getByTestId('task-details').getByRole('button', { name: 'Skip' }).click();
  const pad = page.getByRole('dialog', { name: 'Parent PIN' });
  await expect(pad).toBeVisible();
  await page.goBack();
  await expect(pad).toHaveCount(0);
  await expect(phoneCard(page, 'Feed the fish')).not.toHaveClass(/skipped/);
  await expect(page.locator('.ph-head h1')).toHaveText('Tasks');
  // The pad still works after: the skip goes through with the PIN.
  await phoneCard(page, 'Feed the fish').locator('.tk-body').click();
  await page.getByTestId('task-details').getByRole('button', { name: 'Skip' }).click();
  await enterPin(page);
  await expect(phoneCard(page, 'Feed the fish')).toHaveClass(/skipped/);
  expect(errors()).toEqual([]);
});
