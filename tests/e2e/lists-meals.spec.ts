import { expect, test, type Page } from '@playwright/test';

/*
 * Lists, Meals and Recipes against the demo household (emulators). Each test
 * gets its own fresh household: `?demo=e2e-meals-<run>-<name>`. The seed
 * plans meals relative to the pinned day, Wed Nov 4 2026 (week Sun 1 - Sat 7).
 */
const NOW = 'now=2026-11-04T11:44';
const RUN = process.env.E2E_RUN ?? Date.now().toString(36);

let errors: string[] = [];

async function open(page: Page, name: string, tab: string) {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=e2e-meals-${RUN}-${name}&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await page.locator('.rail button', { hasText: tab }).click();
}

const groceryCard = (page: Page) => page.locator('.list-card', { has: page.locator('.lc-title', { hasText: 'Grocery List' }) });

test.afterEach(() => expect(errors).toEqual([]));

test('adds a list item, checks it off, and adds it again without a duplicate', async ({ page }) => {
  await open(page, 'lists', 'Lists');
  const card = groceryCard(page);
  await expect(card.locator('.lc-count')).toHaveText('7');
  const field = card.getByLabel('Add item to Grocery List');
  await field.fill('2 gal apple juice');
  await field.press('Enter');
  const row = card.locator('.li-row', { hasText: 'Apple juice' });
  await expect(row).toBeVisible();
  await expect(row.locator('.li-qty')).toHaveText('2 gal');
  await expect(card.locator('.lc-count')).toHaveText('8');

  await row.getByRole('checkbox').click();
  await expect(
    card.locator('.ls-group', { has: page.locator('.done-head') }).locator('.li-row', { hasText: 'Apple juice' }),
  ).toBeVisible();
  await expect(card.locator('.lc-count')).toHaveText('7');

  // Typing a checked-off grocery item brings it back instead of adding a second one.
  await field.fill('apple juice');
  await field.press('Enter');
  await expect(card.locator('.li-row', { hasText: /apple juice/i })).toHaveCount(1);
  await expect(card.locator('.li-row', { hasText: /apple juice/i }).getByRole('checkbox')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(card.locator('.lc-count')).toHaveText('8');
});

test('edits a list item: quantity, section and delete', async ({ page }) => {
  await open(page, 'item-edit', 'Lists');
  const card = groceryCard(page);
  await card.locator('.li-text', { hasText: 'Bananas' }).click();
  const pop = page.locator('.popover .item-editor');
  await pop.getByLabel('Quantity').fill('6');
  await pop.getByRole('button', { name: 'Dairy' }).click();
  await pop.getByRole('button', { name: 'Save' }).click();
  const dairy = card.locator('.ls-group', { has: page.locator('.ls-title', { hasText: 'Dairy' }) });
  await expect(dairy.locator('.li-row', { hasText: 'Bananas' }).locator('.li-qty')).toHaveText('6');

  await dairy.locator('.li-text', { hasText: 'Bananas' }).click();
  await page.locator('.popover .item-editor').getByRole('button', { name: 'Delete' }).click();
  await expect(card.locator('.li-row', { hasText: 'Bananas' })).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Deleted Bananas');
});

test('plans a meal from a recipe into an empty cell', async ({ page }) => {
  await open(page, 'plan', 'Meals');
  const cell = page.locator('[data-cell="2026-11-07|lunch"]');
  await expect(cell.locator('.mg-entry')).toHaveCount(0);
  await cell.click();
  const sheet = page.getByRole('dialog', { name: 'Plan meal' });
  await expect(sheet).toContainText('Saturday, Nov 7');
  await sheet.locator('.pick-row', { hasText: 'Spaghetti' }).click();
  await expect(sheet).toBeHidden();
  await expect(cell.locator('.mg-entry')).toContainText('Spaghetti');
  await expect(page.locator('.toast')).toContainText('Lunch planned for Saturday, Nov 7.');
});

test('plans a repeating one-off meal and removes a single day', async ({ page }) => {
  await open(page, 'repeat', 'Meals');
  await page.locator('[data-cell="2026-11-02|breakfast"]').click();
  const sheet = page.getByRole('dialog', { name: 'Plan meal' });
  await sheet.getByRole('tab', { name: 'New entry' }).click();
  await sheet.getByRole('button', { name: /Repeats/ }).click();
  await sheet.getByRole('tab', { name: 'Daily' }).click();
  await sheet.getByPlaceholder('Tacos').fill('Oatmeal');
  await sheet.getByRole('button', { name: 'Plan meal' }).click();
  for (const d of ['02', '03', '04', '05', '06', '07'])
    await expect(page.locator(`[data-cell="2026-11-${d}|breakfast"] .mg-entry`, { hasText: 'Oatmeal' })).toHaveCount(1);
  await expect(page.locator('[data-cell="2026-11-01|breakfast"] .mg-entry')).toHaveCount(0);

  await page.locator('[data-cell="2026-11-05|breakfast"] .mg-entry', { hasText: 'Oatmeal' }).click();
  await page.locator('.popover').getByRole('button', { name: 'Remove meal' }).click();
  await page.getByRole('button', { name: 'Just this day' }).click();
  await expect(page.locator('[data-cell="2026-11-05|breakfast"] .mg-entry', { hasText: 'Oatmeal' })).toHaveCount(0);
  await expect(page.locator('[data-cell="2026-11-06|breakfast"] .mg-entry', { hasText: 'Oatmeal' })).toHaveCount(1);
  await expect(page.locator('[data-cell="2026-11-04|breakfast"] .mg-entry', { hasText: 'Oatmeal' })).toHaveCount(1);
});

test("adds a recipe's ingredients to the grocery list without duplicates", async ({ page }) => {
  await open(page, 'ingredients', 'Recipes');
  await page.locator('.rl-row', { hasText: 'Chicken biryani' }).click();
  await page.getByRole('button', { name: 'Add to grocery list' }).click();
  const modal = page.getByRole('dialog', { name: 'Add to Grocery List?' });
  await expect(modal.locator('.im-row')).toHaveCount(6);
  await expect(modal.locator('.im-row.on-list')).toHaveCount(3);
  await modal.getByRole('button', { name: 'Add 3 items' }).click();
  await expect(page.locator('.toast')).toContainText('Added 3 items to Grocery List.');

  await page.getByRole('button', { name: 'Add to grocery list' }).click();
  await expect(modal).toContainText('Every Chicken biryani ingredient is already on Grocery List.');
  await modal.getByRole('button', { name: 'OK' }).click();

  await page.locator('.rail button', { hasText: 'Lists' }).click();
  const card = groceryCard(page);
  await expect(card.locator('.lc-count')).toHaveText('10');
  for (const text of ['Chicken thighs', 'Basmati rice', 'Onions', 'Yogurt', 'Biryani masala', 'Fresh mint and cilantro'])
    await expect(card.locator('.li-row', { hasText: text })).toHaveCount(1);
  await expect(card.locator('.li-row', { hasText: 'Chicken thighs' }).locator('.li-qty')).toHaveText('2 lb');
});

test('creates a recipe and shows it with numbered steps', async ({ page }) => {
  await open(page, 'recipe', 'Recipes');
  await page.locator('.fab').click();
  const sheet = page.getByRole('dialog', { name: 'New recipe' });
  await sheet.getByPlaceholder('Chicken biryani').fill('Shakshuka');
  await sheet.getByRole('radio', { name: 'Breakfast' }).click();
  await sheet.getByPlaceholder(/2 lb chicken thighs/).fill('6 eggs\n1 can tomatoes\n1 onion');
  await sheet
    .getByPlaceholder('One step per line, or a paragraph')
    .fill('Soften the onion. Add the tomatoes and simmer. Crack in the eggs and cover.');
  await sheet.getByPlaceholder('https://').fill('not a url');
  await expect(sheet.getByRole('button', { name: 'Add recipe' })).toBeDisabled();
  await sheet.getByPlaceholder('https://').fill('https://example.com/shakshuka');
  await sheet.getByRole('button', { name: 'Add recipe' }).click();
  await expect(sheet).toBeHidden();

  const view = page.locator('.recipe-card');
  await expect(view.locator('.rc-title')).toHaveText('Shakshuka');
  await expect(view.locator('.rc-ingredients li')).toHaveCount(3);
  await expect(view.locator('.rc-steps li')).toHaveCount(3);
  await expect(view).toContainText('example.com/shakshuka');
  const breakfast = page.locator('.rl-group', { has: page.locator('.rl-head', { hasText: 'Breakfast' }) });
  await expect(breakfast.locator('.rl-row', { hasText: 'Shakshuka' })).toBeVisible();
});

test('a planned meal opens its recipe', async ({ page }) => {
  await open(page, 'open-recipe', 'Meals');
  await page.locator('[data-cell="2026-11-04|dinner"] .mg-entry', { hasText: 'Chicken biryani' }).click();
  await page.locator('.popover').getByRole('button', { name: 'Open recipe' }).click();
  await expect(page.locator('.rail button.on')).toContainText('Recipes');
  await expect(page.locator('.recipe-card .rc-title')).toHaveText('Chicken biryani');
});
