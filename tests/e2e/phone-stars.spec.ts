import { expect as baseExpect, test, type Page } from '@playwright/test';
import {
  backSettled,
  enterPin,
  phoneCard,
  phoneStars,
  phoneTab,
  serverField,
  setPin,
  wallAndPhone,
  wallCard,
  wallStars,
} from './phone-family';

/*
 * More > Stars and rewards on the phone against a live wall: giving and
 * taking stars, redeeming, rewards added and edited, the history's Undo.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

// Every wall and phone a test opened is its own browser context: close them, or a worker holds them all.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

async function openStars(page: Page) {
  await phoneTab(page, 'More');
  await page.getByRole('button', { name: /Stars and rewards/ }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('Stars and rewards');
}

const row = (page: Page, id: string) => page.locator(`.psv-person[data-person="${id}"]`);
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name: new RegExp(`${name}.*'s stars`) });

test('stars given on the phone, with a reason, show on the wall; Undo takes them back', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'give');
  const page = p.page;
  await openStars(page);
  await expect(row(page, 'asiyah')).toContainText('128');
  await row(page, 'asiyah').click();
  const s = sheet(page, 'Asiyah');
  await s.getByRole('button', { name: 'Give', exact: true }).click();
  await s.getByRole('button', { name: '10', exact: true }).click();
  await s.getByPlaceholder(/Note/).fill('Helped with groceries');
  await expect(s).toContainText('128 → 138 stars');
  await s.getByRole('button', { name: 'Give 10' }).click();
  await expect(page.locator('.toast', { hasText: 'Gave 10 stars' })).toBeVisible();
  await expect(s.locator('.ps-num')).toContainText('138');
  await expect(wallStars(w.page, 'asiyah')).toHaveText('138');
  const entry = s.locator('.hist-entry[data-reason="give"]', { hasText: 'Helped with groceries' });
  await expect(entry).toContainText('+10');

  // Remove stops at the balance, as on the wall.
  await s.getByRole('button', { name: 'Remove', exact: true }).click();
  await s.getByLabel('Number of stars').fill('500');
  await expect(s).toContainText('Enter a whole number from 1 to 138.');
  await s.getByRole('button', { name: 'Cancel' }).click();

  await entry.getByRole('button', { name: 'Undo Stars given' }).click();
  await expect(entry).toHaveClass(/undone/);
  await expect(wallStars(w.page, 'asiyah')).toHaveText('128');
  await expect.poll(() => serverField(household, 'profiles/asiyah', 'stars')).toBe(128);
  // Back closes the sheet and keeps the Stars view.
  await backSettled(page, 3);
  await page.goBack();
  await expect(s).toHaveCount(0);
  await expect(page.locator('.ph-head h1')).toHaveText('Stars and rewards');
  await expect(row(page, 'asiyah')).toContainText('128');
  expect(errors()).toEqual([]);
});

test('a reward redeemed for a person on the phone spends their stars on the wall too', async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'redeem');
  const page = p.page;
  await openStars(page);
  await row(page, 'hashim').click();
  const s = sheet(page, 'Hashim!');
  const book = s.locator('.ps-reward[data-reward="New book"]');
  await expect(book).toContainText('96 of 150 stars');
  await expect(book.getByRole('button', { name: 'Redeem' })).toHaveCount(0);
  await s.locator('.ps-reward[data-reward="Ice cream trip"]').getByRole('button', { name: 'Redeem' }).click();
  const done = page.getByRole('dialog', { name: 'Reward redeemed' });
  await expect(done).toContainText('Ice cream trip redeemed');
  await expect(wallStars(w.page, 'hashim')).toHaveText('46');
  await done.getByRole('button', { name: 'Done' }).click();
  await expect(done).toHaveCount(0);
  await expect(s.locator('.ps-num')).toContainText('46');

  // Undo from the dialog refunds.
  await s.locator('.ps-reward[data-reward="Stay up 30 minutes late"]').getByRole('button', { name: 'Redeem' }).click();
  await expect(wallStars(w.page, 'hashim')).toHaveText('16');
  await done.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.toast', { hasText: 'Stay up 30 minutes late unredeemed, 30 stars back' })).toBeVisible();
  await expect(wallStars(w.page, 'hashim')).toHaveText('46');
  // The Back gesture on the dialog closes the dialog only.
  await s.locator('.ps-reward[data-reward="Stay up 30 minutes late"]').getByRole('button', { name: 'Redeem' }).click();
  await expect(done).toBeVisible();
  await backSettled(page, 4);
  await page.goBack();
  await expect(done).toHaveCount(0);
  await expect(s).toBeVisible();
  expect(errors()).toEqual([]);
});

test('rewards added and edited on the phone show on the wall', async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'rewards');
  const page = p.page;
  await openStars(page);
  await page.getByRole('region', { name: 'Rewards' }).getByRole('button', { name: 'Add a reward' }).click();
  const ed = page.getByRole('dialog', { name: 'Add reward' });
  await ed.getByLabel('Title').fill('Bike ride');
  await ed.getByLabel('Cost in stars').fill('40');
  await ed.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(ed).toHaveCount(0);
  const bike = page.locator('.psv-reward[data-reward="Bike ride"]');
  await expect(bike).toContainText('40 stars');
  await w.page.locator('.rail button', { hasText: 'Rewards' }).click();
  await expect(w.page.locator('[data-column="asiyah"] .rw-card[data-reward="Bike ride"]')).toBeVisible();

  await bike.click();
  const edit = page.getByRole('dialog', { name: 'Edit reward' });
  await edit.getByLabel('Title').fill('Long bike ride');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.psv-reward[data-reward="Long bike ride"]')).toBeVisible();
  await expect(w.page.locator('[data-column="asiyah"] .rw-card[data-reward="Long bike ride"]')).toBeVisible();
  // Deleted at the wall: gone from the phone.
  await w.page.locator('[data-column="asiyah"] .rw-card[data-reward="Long bike ride"] .rw-body').click();
  await w.page.getByRole('dialog', { name: 'Edit reward' }).getByRole('button', { name: 'Delete' }).click();
  await w.page.getByRole('dialog', { name: 'Delete "Long bike ride"?' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.psv-reward[data-reward="Long bike ride"]')).toHaveCount(0);
  expect(errors()).toEqual([]);
});

test("the star pill on the Tasks tab opens that person's stars, live from the wall", async ({ browser }) => {
  const { w, p, errors } = await wallAndPhone(browser, 'pill', { tab: 'Tasks' });
  const page = p.page;
  await phoneStars(page).click();
  const s = sheet(page, 'Asiyah');
  await expect(s.locator('.ps-num')).toContainText('128');
  await wallCard(w.page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await expect(s.locator('.ps-num')).toContainText('130');
  await expect(s.locator('.hist-entry[data-reason="task"]', { hasText: 'Breakfast' })).toContainText('+2');
  await backSettled(page, 2);
  await page.goBack();
  await expect(s).toHaveCount(0);
  await expect(phoneCard(page, 'Breakfast')).toHaveClass(/done/);
  expect(errors()).toEqual([]);
});

test('signed in as the wall, giving stars and redeeming ask for the PIN', async ({ browser }) => {
  const { household, w, p, errors } = await wallAndPhone(browser, 'stars-pin');
  await setPin(household);
  const page = p.page;
  await openStars(page);
  await row(page, 'asiyah').click();
  const s = sheet(page, 'Asiyah');
  await s.getByRole('button', { name: 'Give', exact: true }).click();
  await enterPin(page);
  await s.getByRole('button', { name: 'Give 5' }).click();
  await expect(wallStars(w.page, 'asiyah')).toHaveText('133');
  // Unlocked now, for the relock minutes: redeeming goes straight through.
  await s.locator('.ps-reward[data-reward="Ice cream trip"]').getByRole('button', { name: 'Redeem' }).click();
  await expect(page.getByRole('dialog', { name: 'Reward redeemed' })).toBeVisible();
  await expect(wallStars(w.page, 'asiyah')).toHaveText('83');
  expect(errors()).toEqual([]);
});
