import { expect as baseExpect, test, devices, type Page } from '@playwright/test';
import { newContext } from './phone-helpers';

/*
 * Grocery suggestions (features/lists/suggest.ts, memory.ts): Add item on a
 * grocery list suggests what the household has put on its grocery lists,
 * as it is typed. The demo's Grocery List starts the memory: Bananas,
 * Spinach, Onions, Milk, Yogurt, Basmati rice, Pita bread open, Olive oil
 * checked off.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 90_000 });
const NOW = 'now=2026-11-04T11:44';
const RUN = Date.now().toString(36);

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

function track(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function openLists(page: Page, name: string) {
  const errors = track(page);
  await page.goto(`/?demo=e2e-sug-${RUN}-${name}&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  await page.locator('.rail button', { hasText: 'Lists' }).click();
  return errors;
}

const groceryCard = (page: Page) => page.locator('.list-card', { has: page.locator('.lc-title', { hasText: 'Grocery List' }) });
const suggestions = (scope: ReturnType<Page['locator']>) => scope.locator('.li-sugs .li-sug-text');

test('a grocery list suggests what it held before as it is typed; a tap adds it, an open one is marked', async ({ page }) => {
  const errors = await openLists(page, 'pick');
  const card = groceryCard(page);
  await expect(card.locator('.lc-count')).toHaveText('7');
  const field = card.getByLabel('Add item to Grocery List');
  // Nothing before anything is typed.
  await field.focus();
  await expect(card.locator('.li-sugs')).toHaveCount(0);

  // An item on the list now is marked, and a tap on it adds nothing.
  await field.fill('ban');
  await expect(suggestions(card)).toHaveText(['Bananas']);
  await card.getByRole('button', { name: 'Bananas, on the list' }).click();
  await expect(card.locator('.lc-count')).toHaveText('7');
  // A tap within the double-tap time of the last one is that tap's rest (ui/overlays.tsx swallowRestOfTap).
  await page.waitForTimeout(500);

  // A checked-off one comes back; the field empties and keeps its focus for the next item.
  await field.fill('oli');
  await expect(suggestions(card)).toHaveText(['Olive oil']);
  await card.getByRole('button', { name: 'Add Olive oil' }).click();
  await expect(card.locator('.lc-count')).toHaveText('8');
  await expect(field).toHaveValue('');
  await expect(field).toBeFocused();
  await expect(card.locator('.li-sugs')).toHaveCount(0);
  await page.waitForTimeout(500);

  // A new item is remembered, even once it is gone from the list.
  await field.fill('Saffron');
  await field.press('Enter');
  const saffron = card.locator('.li-row', { hasText: 'Saffron' });
  await expect(saffron).toBeVisible();
  await saffron.locator('.li-text').click();
  await page.locator('.popover .item-editor').getByRole('button', { name: 'Delete' }).click();
  await expect(saffron).toHaveCount(0);
  await field.fill('saff');
  await expect(suggestions(card)).toHaveText(['Saffron']);
  await card.getByRole('button', { name: 'Add Saffron' }).click();
  await expect(card.locator('.li-row', { hasText: 'Saffron' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a suggestion can be forgotten, with Undo; a to-do list suggests nothing', async ({ page }) => {
  const errors = await openLists(page, 'forget');
  const card = groceryCard(page);
  const field = card.getByLabel('Add item to Grocery List');
  await field.fill('yog');
  await expect(suggestions(card)).toHaveText(['Yogurt']);
  await card.getByRole('button', { name: 'Stop suggesting Yogurt' }).click();
  await expect(card.locator('.li-sugs')).toHaveCount(0);
  // Forgetting a suggestion leaves the list alone.
  await expect(card.locator('.li-row', { hasText: 'Yogurt' })).toHaveCount(1);
  await expect(field).toBeFocused();
  await page.locator('.toast', { hasText: 'Yogurt is no longer suggested.' }).getByRole('button', { name: 'Undo' }).click();
  await field.fill('yogu');
  await expect(suggestions(card)).toHaveText(['Yogurt']);

  const todo = page.locator('.list-card', { has: page.locator('.lc-title', { hasText: 'To Do' }) });
  await todo.getByLabel('Add item to To Do').fill('cal');
  await page.waitForTimeout(300);
  await expect(todo.locator('.li-sugs')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the phone suggests what the wall put on the list, and a double tap there adds it once', async ({ browser, page }) => {
  const name = 'phone';
  const errors = await openLists(page, name);
  const card = groceryCard(page);
  const field = card.getByLabel('Add item to Grocery List');
  await field.fill('Cardamom pods');
  await field.press('Enter');
  const row = card.locator('.li-row', { hasText: 'Cardamom pods' });
  await row.getByRole('checkbox').click();
  await expect(card.locator('.lc-count')).toHaveText('7');

  const phone = await (await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' })).newPage();
  const phoneErrors = track(phone);
  await phone.goto(`/?demo=e2e-sug-${RUN}-${name}&layout=phone&${NOW}`);
  await expect(phone.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await phone.locator('.ph-nav button', { hasText: 'Lists' }).click();
  await phone.locator('.phl-row', { hasText: 'Grocery List' }).click();
  const list = phone.locator('.phl-card');
  await phone.waitForTimeout(500);
  await list.getByLabel('Add item to Grocery List').fill('card');
  const pick = list.getByRole('button', { name: 'Add Cardamom pods' });
  await expect(pick).toBeVisible();
  // A quick double tap: one add, and the second tap presses nothing that moved up under it.
  const b = (await pick.boundingBox())!;
  await phone.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await phone.waitForTimeout(120);
  await phone.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(card.locator('.lc-count')).toHaveText('8');
  await expect(card.locator('.li-row', { hasText: 'Cardamom pods' })).toHaveCount(1);
  await expect(card.locator('.li-row', { hasText: 'Cardamom pods' }).getByRole('checkbox')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await phone.waitForTimeout(800);
  await expect(card.locator('.lc-count')).toHaveText('8');
  expect([...errors, ...phoneErrors]).toEqual([]);
});
