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

/*
 * Documents written straight into the emulator before the page opens (the
 * owner token bypasses the rules). A household that already has a list is
 * not given the demo family, so `fresh` is a real first run: one empty
 * Grocery List and nothing else.
 */
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents';
type Plain = string | number | boolean | Plain[] | { [k: string]: Plain };
const enc = (v: Plain): object =>
  typeof v === 'string'
    ? { stringValue: v }
    : typeof v === 'boolean'
      ? { booleanValue: v }
      : typeof v === 'number'
        ? { integerValue: String(v) }
        : Array.isArray(v)
          ? { arrayValue: { values: v.map(enc) } }
          : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
async function seedDoc(name: string, collection: string, doc: { id: string } & Record<string, Plain>) {
  const res = await fetch(`${FIRESTORE}/households/demo-e2e-meals-${RUN}-${name}/${collection}/${doc.id}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(doc).map(([k, x]) => [k, enc(x)])) }),
  });
  expect(res.ok).toBe(true);
}
const fresh = (name: string) =>
  seedDoc(name, 'lists', {
    id: 'grocery',
    title: 'Grocery List',
    kind: 'grocery',
    emoji: '🛒',
    sections: [],
    isDefaultGrocery: true,
    order: 0,
    createdAt: 1,
  });

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
  await expect(page.locator('.toast')).toContainText('Deleted \u2068Bananas\u2069');
});

/** A Firestore REST value, as far as these tests read one. */
interface Value {
  stringValue?: string;
  arrayValue?: { values?: Value[] };
  mapValue?: { fields: Record<string, Value> };
}

/** The demo household's documents in a collection, by their `text` or `title` field. */
async function serverDocs(name: string, collection: string): Promise<Map<string, Record<string, Value>>> {
  const res = await fetch(`${FIRESTORE}/households/demo-e2e-meals-${RUN}-${name}/${collection}?pageSize=500`, {
    headers: { Authorization: 'Bearer owner' },
  });
  const body = (await res.json()) as { documents: { fields: Record<string, Value> }[] };
  return new Map(body.documents.map((d) => [(d.fields.text ?? d.fields.title).stringValue!, d.fields]));
}

/** Change some fields of a document, as another device would; the rest stay. */
async function patchFields(name: string, path: string, fields: Record<string, Plain>) {
  const mask = Object.keys(fields)
    .map((f) => `updateMask.fieldPaths=${f}`)
    .join('&');
  const res = await fetch(`${FIRESTORE}/households/demo-e2e-meals-${RUN}-${name}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, enc(x)])) }),
  });
  expect(res.ok).toBe(true);
}

test('the item editor writes only what it changed: a move made meanwhile on another device stays', async ({ page }) => {
  await open(page, 'item-edit-merge', 'Lists');
  const card = groceryCard(page);
  await card.locator('.li-text', { hasText: 'Milk' }).click();
  const pop = page.locator('.popover .item-editor');
  await pop.getByLabel('Quantity').fill('1 gal');
  // Another device moves Milk to Produce while the editor is open here.
  const milk = (await serverDocs('item-edit-merge', 'listItems')).get('Milk')!;
  const list = (await serverDocs('item-edit-merge', 'lists')).get('Grocery List')!;
  const produce = list.sections!.arrayValue!.values!.map((v) => v.mapValue!.fields).find((s) => s.name.stringValue === 'Produce')!
    .id.stringValue!;
  await patchFields('item-edit-merge', `listItems/${milk.id.stringValue}`, { sectionId: produce });
  await expect(card.locator('.ls-group', { has: page.locator('.ls-title', { hasText: 'Produce' }) })).toContainText('Milk');
  await pop.getByRole('button', { name: 'Save' }).click();
  const group = (title: string) => card.locator('.ls-group', { has: page.locator('.ls-title', { hasText: title }) });
  await expect(group('Produce').locator('.li-row', { hasText: 'Milk' }).locator('.li-qty')).toHaveText('1 gal');
  await expect(group('Dairy').locator('.li-row', { hasText: 'Milk' })).toHaveCount(0);
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
  await expect(page.locator('.toast')).toContainText('Added 3 items to \u2068Grocery List\u2069.');

  await page.getByRole('button', { name: 'Add to grocery list' }).click();
  await expect(modal).toContainText('Every Chicken biryani ingredient is already on Grocery List.');
  await modal.getByRole('button', { name: 'OK' }).click();

  await page.locator('.rail button', { hasText: 'Lists' }).click();
  const card = groceryCard(page);
  await expect(card.locator('.lc-count')).toHaveText('10');
  for (const text of ['Chicken thighs', 'Basmati rice', 'Onions', 'Yogurt', 'Biryani masala', 'Fresh mint and cilantro'])
    await expect(card.locator('.li-row', { hasText: text })).toHaveCount(1);
  await expect(card.locator('.li-row', { hasText: 'Chicken thighs' }).locator('.li-qty')).toHaveText('2 lb');
  // The ingredients are remembered for the grocery suggestions too.
  await card.getByLabel('Add item to Grocery List').fill('biry');
  await expect(card.locator('.li-sugs .li-sug-text')).toHaveText(['Biryani masala']);
});

test('an ingredient put on the list while the modal is open is not added twice', async ({ page }) => {
  await open(page, 'ingredients-race', 'Recipes');
  await page.locator('.rl-row', { hasText: 'Chicken biryani' }).click();
  await page.getByRole('button', { name: 'Add to grocery list' }).click();
  const modal = page.getByRole('dialog', { name: 'Add to Grocery List?' });
  await expect(modal.getByRole('button', { name: 'Add 3 items' })).toBeVisible();
  // Another device puts chicken thighs on the list meanwhile.
  const list = (await serverDocs('ingredients-race', 'lists')).get('Grocery List')!;
  await seedDoc('ingredients-race', 'listItems', {
    id: 'from-phone',
    listId: list.id.stringValue!,
    text: 'Chicken thighs',
    done: false,
    order: -50,
    createdAt: 2,
  });
  await page.waitForTimeout(500);
  await modal.getByRole('button', { name: 'Add 3 items' }).click();
  await expect(page.locator('.toast')).toContainText('Added 2 items to ⁨Grocery List⁩.');
  await page.locator('.rail button', { hasText: 'Lists' }).click();
  const card = groceryCard(page);
  await expect(card.locator('.li-row', { hasText: 'Chicken thighs' })).toHaveCount(1);
  await expect(card.locator('.li-row', { hasText: 'Biryani masala' })).toHaveCount(1);
  await expect(card.locator('.lc-count')).toHaveText('10');
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

test('moving a weekly meal to another day for this and following days keeps it on that day', async ({ page }) => {
  await seedDoc('repeat-move', 'meals', {
    id: 'mondays',
    date: '2026-10-26',
    category: 'dinner',
    title: 'Pasta night',
    repeat: { every: 1, unit: 'week', weekdays: [1] },
    order: 0,
    createdAt: 1,
  });
  await open(page, 'repeat-move', 'Meals');
  const pasta = (d: string) => page.locator(`[data-cell="2026-11-${d}|dinner"] .mg-entry`, { hasText: 'Pasta night' });
  await pasta('02').click();
  await page.locator('.popover').getByRole('button', { name: 'Edit meal' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit meal' });
  await sheet.locator('.slot-day').click();
  // The chips start at the meal's own (past) day; only the real today is called Today.
  await expect(sheet.locator('.day-picker .chip')).toHaveText(['Mon 2', 'Tue 3', 'Today', 'Tomorrow', 'Fri 6', 'Sat 7', 'Sun 8']);
  await sheet.getByRole('button', { name: 'Tue 3' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'This and following days' }).click();
  await expect(pasta('03')).toHaveCount(1);
  await expect(pasta('02')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next week' }).click();
  await expect(pasta('10')).toHaveCount(1);
  await expect(pasta('09')).toHaveCount(0);
});

test('the item editor keeps a move made before Save', async ({ page }) => {
  await open(page, 'item-move-save', 'Lists');
  const produce = groceryCard(page).locator('.ls-group', { has: page.locator('.ls-title', { hasText: 'Produce' }) });
  await produce.locator('.li-text', { hasText: 'Spinach' }).click();
  const pop = page.locator('.popover .item-editor');
  await pop.getByRole('button', { name: 'Move up' }).click();
  await expect(produce.locator('.li-text > bdi:first-child')).toHaveText(['Spinach', 'Bananas', 'Onions']);
  await pop.getByLabel('Quantity').fill('1 bag');
  await pop.getByRole('button', { name: 'Save' }).click();
  await expect(produce.locator('.li-row', { hasText: 'Spinach' }).locator('.li-qty')).toHaveText('1 bag');
  await expect(produce.locator('.li-text > bdi:first-child')).toHaveText(['Spinach', 'Bananas', 'Onions']);
});

test('grocery items made of emoji, or starting with a percentage, are added as typed', async ({ page }) => {
  await open(page, 'emoji-items', 'Lists');
  const card = groceryCard(page);
  const field = card.getByLabel('Add item to Grocery List');
  for (const text of ['🍎', '🍌', '2% milk']) {
    await field.fill(text);
    await field.press('Enter');
    await expect(card.locator('.li-text > bdi:first-child', { hasText: text })).toHaveCount(1);
  }
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(card.locator('.lc-count')).toHaveText('10');
});

test('a long list scrolls to the item just added, or to the one already on it', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await open(page, 'reveal', 'Lists');
  const card = groceryCard(page);
  const body = card.locator('.lc-body');
  const field = card.getByLabel('Add item to Grocery List');
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await field.fill('Zucchini');
  await field.press('Enter');
  await expect(card.locator('.li-row', { hasText: 'Zucchini' })).toBeInViewport();
  await body.evaluate((el) => (el.scrollTop = 0));
  await expect(card.locator('.li-row', { hasText: 'Pita bread' })).not.toBeInViewport();
  await field.fill('pita bread');
  await field.press('Enter');
  await expect(page.locator('.toast')).toContainText('\u2068Pita bread\u2069 is already on \u2068Grocery List\u2069.');
  await expect(card.locator('.li-row', { hasText: 'Pita bread' })).toBeInViewport();
});

test('unchecking an item while it settles shows it unchecked at once', async ({ page }) => {
  await open(page, 'settle-uncheck', 'Lists');
  const box = groceryCard(page).locator('.li-row', { hasText: 'Bananas' }).getByRole('checkbox');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await box.click();
  // The settle delay is 700 ms; the box must not keep showing a check through it.
  await expect(box).toHaveAttribute('aria-checked', 'false', { timeout: 250 });
  await expect(groceryCard(page).locator('.lc-count')).toHaveText('7');
});

test("a toast's Add ingredients opens the modal on whatever tab is showing", async ({ page }) => {
  await open(page, 'toast-elsewhere', 'Meals');
  await page.locator('[data-cell="2026-11-07|lunch"]').click();
  await page.getByRole('dialog', { name: 'Plan meal' }).locator('.pick-row', { hasText: 'Spaghetti' }).click();
  await page.locator('.rail button', { hasText: 'Lists' }).click();
  await page.locator('.toast').getByRole('button', { name: 'Add ingredients' }).click();
  const modal = page.getByRole('dialog', { name: 'Add to Grocery List?' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Add 5 items' }).click();
  await expect(groceryCard(page).locator('.li-row', { hasText: 'Marinara' })).toHaveCount(1);
  await page.locator('.rail button', { hasText: 'Meals' }).click();
  await expect(modal).toBeHidden();
});

test('a meal tapped on the calendar opens the Meals tab at its week', async ({ page }) => {
  await seedDoc('cal-meal-week', 'meals', {
    id: 'later',
    date: '2026-11-10',
    category: 'dinner',
    title: 'Fish tacos',
    order: 0,
    createdAt: 1,
  });
  await open(page, 'cal-meal-week', 'Calendar');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.cal-meal', { hasText: 'Fish tacos' }).click();
  await expect(page.locator('.rail button.on')).toContainText('Meals');
  await expect(page.locator('[data-cell="2026-11-10|dinner"] .mg-entry')).toContainText('Fish tacos');
  await expect(page.locator('.topbar')).toContainText('Nov 8 - 14');
});

test('renaming a recipe renames the meals planned from it, not ones retitled by hand', async ({ page }) => {
  await open(page, 'recipe-rename', 'Meals');
  // Retitle one of the two planned biryanis by hand.
  await page.locator('[data-cell="2026-11-07|dinner"] .mg-entry').click();
  await page.locator('.popover').getByRole('button', { name: 'Edit meal' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit meal' });
  await sheet.getByPlaceholder('Tacos').fill('Leftover biryani');
  await sheet.getByRole('button', { name: 'Save' }).click();

  await page.locator('.rail button', { hasText: 'Recipes' }).click();
  await page.locator('.rl-row', { hasText: 'Chicken biryani' }).click();
  await page.getByRole('button', { name: 'Edit recipe' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit recipe' });
  await editor.getByPlaceholder('Chicken biryani').fill('Hyderabadi biryani');
  await editor.getByRole('button', { name: 'Save' }).click();

  await page.locator('.rail button', { hasText: 'Meals' }).click();
  await expect(page.locator('[data-cell="2026-11-04|dinner"] .mg-entry')).toContainText('Hyderabadi biryani');
  await expect(page.locator('[data-cell="2026-11-07|dinner"] .mg-entry')).toContainText('Leftover biryani');
});

test('a first-run household plans a typed meal and adds its pasted ingredients after deleting its only list', async ({
  page,
}) => {
  await fresh('first-run');
  await open(page, 'first-run', 'Lists');
  await page.getByRole('button', { name: 'Grocery List menu' }).click();
  await page.getByRole('button', { name: 'Delete list' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.tab-body')).toContainText('No lists yet.');

  await page.locator('.rail button', { hasText: 'Meals' }).click();
  await page.locator('[data-cell="2026-11-05|dinner"]').click();
  // No recipes yet: the sheet opens on New entry, the only way to plan.
  const sheet = page.getByRole('dialog', { name: 'Plan meal' });
  await expect(sheet.getByRole('tab', { name: 'New entry' })).toHaveAttribute('aria-selected', 'true');
  await sheet.getByPlaceholder('Tacos').fill('Pancakes');
  await sheet.getByRole('switch', { name: 'Save to recipes' }).click();
  await sheet.getByPlaceholder(/1 lb ground beef/).fill('Ingredients:\n1. 2 cups flour\n2. 3 eggs\n• 2% milk\n');
  await sheet.getByRole('button', { name: 'Plan meal' }).click();
  await page.locator('.toast').getByRole('button', { name: 'Add ingredients' }).click();
  const modal = page.getByRole('dialog', { name: 'Add to Grocery List?' });
  await expect(modal.locator('.im-text')).toHaveText(['2 cups flour', '3 eggs', '2% milk']);
  await modal.getByRole('button', { name: 'Add 3 items' }).click();

  await page.locator('.rail button', { hasText: 'Lists' }).click();
  const card = groceryCard(page);
  await expect(card.locator('.li-text > bdi:first-child')).toHaveText(['Flour', 'Eggs', '2% milk']);
  await expect(card.locator('.li-qty')).toHaveText(['2 cups', '3']);
});

test('deleting the grocery list never sends ingredients to a to-do list', async ({ page }) => {
  await open(page, 'default-handoff', 'Lists');
  await page.getByRole('button', { name: 'Grocery List menu' }).click();
  await page.getByRole('button', { name: 'Delete list' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  const editor = page.getByRole('dialog', { name: 'New list' });
  // A to-do list made first must not become the target either.
  await page.locator('.fab').click();
  await editor.getByRole('textbox', { name: 'Title' }).fill('Chores');
  await editor.getByRole('button', { name: 'Add list' }).click();
  await page.locator('.fab').click();
  await editor.getByRole('textbox', { name: 'Title' }).fill('Groceries');
  await editor.getByRole('tab', { name: 'Grocery' }).click();
  await editor.getByRole('button', { name: 'Add list' }).click();
  await page.locator('.rail button', { hasText: 'Recipes' }).click();
  await page.locator('.rl-row', { hasText: 'Pancakes' }).click();
  await page.getByRole('button', { name: 'Add to grocery list' }).click();
  await expect(page.getByRole('dialog', { name: 'Add to Groceries?' })).toBeVisible();
});

test('a crowded meal cell keeps its + clear of the meals and scrolls them', async ({ page }) => {
  for (let i = 0; i < 5; i++)
    await seedDoc('crowded', 'meals', {
      id: `m${i}`,
      date: '2026-11-03',
      category: 'dinner',
      title: `Dish number ${i + 1}`,
      order: i,
      createdAt: 1,
    });
  await open(page, 'crowded', 'Meals');
  const cell = page.locator('[data-cell="2026-11-03|dinner"]');
  await expect(cell.locator('.mg-entry')).toHaveCount(5);
  const list = (await cell.locator('.mg-list').boundingBox())!;
  const add = (await cell.locator('.mg-add').boundingBox())!;
  expect(add.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
  expect(await cell.locator('.mg-list').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await cell.locator('.mg-list').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await cell.locator('.mg-entry', { hasText: 'Dish number 5' }).click();
  await expect(page.locator('.popover .mp-title')).toHaveText('Dish number 5');
});

test('the recipe view wraps long unbroken names, ingredients and source addresses', async ({ page }) => {
  const long = 'Supercalifragilisticexpialidocious'.repeat(3);
  await open(page, 'recipe-wrap', 'Recipes');
  await page.locator('.fab').click();
  const sheet = page.getByRole('dialog', { name: 'New recipe' });
  await sheet.getByPlaceholder('Chicken biryani').fill(long);
  await sheet.getByPlaceholder(/2 lb chicken thighs/).fill(`For the sauce:\n2 cups ${long}`);
  await sheet.getByPlaceholder('One step per line, or a paragraph').fill(`Stir the ${long} well.`);
  await sheet.getByPlaceholder('https://').fill(`https://example.com/${long}/${long}`);
  await sheet.getByRole('button', { name: 'Add recipe' }).click();
  const card = page.locator('.recipe-card');
  await expect(card.locator('.rc-title')).toHaveText(long);
  expect(await card.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  // A line ending in a colon is a heading, not an ingredient.
  await expect(card.locator('.rc-ingredients li.rc-ing-head')).toHaveText('For the sauce');
});

test('a meal category named with an emoji shows the whole emoji in its badge', async ({ page }) => {
  await open(page, 'emoji-category', 'Meals');
  await page.getByRole('button', { name: 'Filter' }).click();
  await page.getByRole('button', { name: 'Edit Snack' }).click();
  await page.getByLabel('Rename Snack').fill('🍿 Treats');
  await page.getByLabel('Rename Snack').press('Enter');
  await expect(page.locator('.mg-cat', { hasText: 'Treats' }).locator('.cat-badge')).toHaveText('🍿');
});

test('the item editor stays on screen when the keyboard shrinks the page', async ({ page }) => {
  await open(page, 'keyboard', 'Lists');
  await groceryCard(page).locator('.li-text', { hasText: 'Pita bread' }).click();
  const pop = page.locator('.popover');
  await expect(pop).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 560 });
  await expect(pop.getByLabel('Item')).toBeInViewport();
  await expect(pop.getByRole('button', { name: 'Save' })).toBeInViewport();
});
