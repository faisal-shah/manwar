import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';

/*
 * A household over time and across devices: what a family sets up, edits
 * and deletes stays set up, edited and deleted, whichever tablet did it and
 * whatever another tablet had open at the time. Two browser contexts on
 * the same demo household are two tablets on the wall.
 */

// A change made on one tablet reaches the other through the emulator, which is slower than a local write.
const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 90_000 });

const RUN = Date.now().toString(36);
const FS = 'http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents';
const AUTH = { Authorization: 'Bearer owner' };
const NOW = 'now=2026-11-04T11:44';

const rail = (page: Page, label: string) => page.locator('.rail button', { hasText: label });

type Value = { stringValue?: string; integerValue?: string; booleanValue?: boolean; nullValue?: null };
type Fields = Record<string, Value>;
async function docs(household: string, col: string): Promise<Fields[]> {
  const res = await fetch(`${FS}/households/demo-${household}/${col}?pageSize=1000`, { headers: AUTH });
  const body = (await res.json()) as { documents?: { fields: Fields }[] };
  return (body.documents ?? []).map((d) => d.fields);
}
const text = (d: Fields, k: string) => d[k]?.stringValue;
const num = (d: Fields, k: string) => Number(d[k]?.integerValue ?? 0);

/** The emulator's view, polled: the page shows its own writes before the server has them. */
const serverTitles = (household: string, col: string, key: string) => async () =>
  (await docs(household, col)).map((d) => text(d, key)).sort();

interface Tablet {
  page: Page;
  errors: string[];
}

async function tablet(browser: Browser, household: string, extra = ''): Promise<Tablet> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Chicago' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=${household}&${NOW}${extra}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  return { page, errors };
}

/** Two tablets on one demo household, the second opened once the demo family is on the server. */
async function twoTablets(browser: Browser, name: string) {
  const household = `e2e-flows-${RUN}-${name}`;
  const a = await tablet(browser, household);
  await expect.poll(async () => (await docs(household, 'profiles')).length, { timeout: 40_000 }).toBe(4);
  const b = await tablet(browser, household);
  return { household, a: a.page, b: b.page, errors: () => [...a.errors, ...b.errors] };
}

test('a household is seeded once: its first Grocery List, once deleted, stays deleted', async ({ browser }) => {
  const household = `e2e-flows-${RUN}-seed-once`;
  const { page, errors } = await tablet(browser, household, '&seed=none');
  await rail(page, 'Lists').click();
  await page.getByRole('button', { name: 'Grocery List menu' }).click();
  await page.getByRole('button', { name: 'Delete list' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.tab-body')).toContainText('No lists yet.');
  await expect.poll(serverTitles(household, 'lists', 'title')).toEqual([]);

  // No people and no lists, as on the first run; the household is still not new.
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  await rail(page, 'Lists').click();
  await page.waitForTimeout(2000);
  await expect(page.locator('.tab-body')).toContainText('No lists yet.');
  expect(await serverTitles(household, 'lists', 'title')()).toEqual([]);
  expect(errors).toEqual([]);
});

test('a list or recipe deleted on one tablet stays deleted when the other saves its open editor', async ({ browser }) => {
  const { household, a, b, errors } = await twoTablets(browser, 'deleted-under-editor');
  for (const p of [a, b]) await rail(p, 'Lists').click();
  await a.getByRole('button', { name: 'To Do menu' }).click();
  await a.getByRole('button', { name: 'Edit list' }).click();
  const listEditor = a.getByRole('dialog', { name: 'Edit list' });
  await listEditor.getByRole('textbox', { name: 'Title' }).fill('To Do soon');
  await b.getByRole('button', { name: 'To Do menu' }).click();
  await b.getByRole('button', { name: 'Delete list' }).click();
  await b.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  // The editor closes and says why, instead of saving the list back without its items.
  await expect(listEditor).toHaveCount(0);
  await expect(a.locator('.toast')).toContainText('To Do was deleted on another device.');
  await expect.poll(serverTitles(household, 'lists', 'title')).toEqual(['Camping packing', 'Grocery List']);

  for (const p of [a, b]) {
    await rail(p, 'Recipes').click();
    await p.locator('.rl-row', { hasText: 'Grilled cheese' }).click();
  }
  await a.getByRole('button', { name: 'Edit recipe' }).click();
  const recipeEditor = a.getByRole('dialog', { name: 'Edit recipe' });
  await expect(recipeEditor).toBeVisible();
  await b.getByRole('button', { name: 'Delete recipe' }).click();
  await b.getByRole('dialog').getByRole('button', { name: 'Delete the recipe, keep planned meals' }).click();
  await expect(recipeEditor).toHaveCount(0);
  await expect.poll(async () => (await serverTitles(household, 'recipes', 'name')()).includes('Grilled cheese')).toBe(false);
  await a.waitForTimeout(1000);
  expect(await serverTitles(household, 'recipes', 'name')()).not.toContain('Grilled cheese');
  expect(errors()).toEqual([]);
});

test('a task deleted on one tablet cannot be checked off from what the other has open', async ({ browser }) => {
  const { household, a, b, errors } = await twoTablets(browser, 'deleted-task');
  for (const p of [a, b]) await rail(p, 'Tasks').click();
  const plants = (p: Page) => p.locator('[data-column="asiyah"] .tk-card[data-task="Water the plants"]');
  const dishes = (p: Page) => p.locator('[data-column="*"] .tk-card[data-task="Empty dishwasher"]');
  const remove = async (card: Locator) => {
    await card.locator('.tk-body').click();
    await b.getByRole('button', { name: 'Delete task' }).click();
    await b.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  };

  // The details popover on A closes when B deletes the chore.
  await expect(plants(a)).toBeVisible({ timeout: 15_000 });
  await plants(a).locator('.tk-body').click();
  await expect(a.getByTestId('task-details')).toBeVisible();
  await remove(plants(b));
  await expect(a.getByTestId('task-details')).toHaveCount(0);

  // So does "Who did it?" for an Up for Grabs chore.
  await dishes(a).locator('.tk-check').click();
  const claim = a.getByRole('dialog', { name: 'Who did it?' });
  await expect(claim).toBeVisible();
  await remove(dishes(b));
  await expect(claim).toHaveCount(0);

  await a.waitForTimeout(1000);
  const stars = Object.fromEntries((await docs(household, 'profiles')).map((p) => [text(p, 'id'), num(p, 'stars')]));
  expect(stars).toMatchObject({ asiyah: 128, hashim: 96 });
  expect(await docs(household, 'taskStates')).toEqual([]);
  expect(errors()).toEqual([]);
});

test('removing one day of a repeating meal keeps the rename another tablet just made', async ({ browser }) => {
  const { household, a, b, errors } = await twoTablets(browser, 'meal-series');
  for (const p of [a, b]) await rail(p, 'Meals').click();
  // A weekly lunch on Thursdays, planned on A.
  await a.locator('[data-cell="2026-11-05|lunch"]').click();
  const plan = a.getByRole('dialog', { name: 'Plan meal' });
  await plan.getByRole('tab', { name: 'New entry' }).click();
  await plan.getByPlaceholder('Tacos').fill('Soup');
  await plan.getByRole('button', { name: /Repeats/ }).click();
  await plan.getByRole('tab', { name: 'Weekly' }).click();
  await plan.getByRole('button', { name: 'Plan meal' }).click();
  await expect(b.locator('[data-cell="2026-11-05|lunch"] .mg-entry')).toContainText('Soup');

  // A opens next Thursday's popover; B renames the series meanwhile.
  await a.getByRole('button', { name: 'Next week' }).click();
  await a.locator('[data-cell="2026-11-12|lunch"] .mg-entry').click();
  await expect(a.locator('.meal-pop')).toBeVisible();
  await b.locator('[data-cell="2026-11-05|lunch"] .mg-entry').click();
  await b.getByRole('button', { name: 'Edit meal' }).click();
  const edit = b.getByRole('dialog', { name: 'Edit meal' });
  await edit.getByPlaceholder('Tacos').fill('Lentil soup');
  await edit.getByRole('button', { name: 'Save' }).click();
  await b.getByRole('button', { name: 'Every time' }).click();
  await expect(a.locator('.meal-pop .mp-title')).toHaveText('Lentil soup');

  await a.getByRole('button', { name: 'Remove meal' }).click();
  await a.getByRole('button', { name: 'Just this day' }).click();
  await expect(a.locator('[data-cell="2026-11-12|lunch"] .mg-entry')).toHaveCount(0);
  await a.getByRole('button', { name: 'Next week' }).click();
  await expect(a.locator('[data-cell="2026-11-19|lunch"] .mg-entry')).toContainText('Lentil soup');
  await expect
    .poll(async () =>
      (await docs(household, 'meals')).filter((m) => text(m, 'category') === 'lunch').map((m) => text(m, 'title')),
    )
    .not.toContain('Soup');
  expect(errors()).toEqual([]);
});

test('a profile deleted on one tablet closes its editor on the other, which cannot bring it back', async ({ browser }) => {
  const { household, a, b, errors } = await twoTablets(browser, 'deleted-profile');
  for (const p of [a, b]) {
    await rail(p, 'Settings').click();
    await p.locator('.set-menu button', { hasText: /^Profiles$/ }).click();
    await p.getByRole('button', { name: 'Edit Hashim!' }).click();
  }
  await a.getByRole('textbox', { name: 'Name' }).fill('Hashim');
  await b.getByRole('button', { name: 'Delete', exact: true }).click();
  await b.getByRole('button', { name: 'Delete profile' }).click();
  await expect(a.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(a.locator('.toast')).toContainText('Hashim! was deleted on another device.');
  await expect(a.locator('.profile-row')).toHaveCount(3);
  await expect.poll(serverTitles(household, 'profiles', 'name')).toEqual(['Asiyah', 'Baba', 'Mamma']);
  expect(errors()).toEqual([]);
});

test('a profile deleted on one tablet is not saved back onto a shared task by the other', async ({ browser }) => {
  const { household, a, b, errors } = await twoTablets(browser, 'ghost-assignee');
  await rail(a, 'Tasks').click();
  await a.locator('[data-column="asiyah"] .tk-card[data-task="Brush teeth"]').first().locator('.tk-body').click();
  await a.getByRole('button', { name: 'Edit task' }).click();
  const editor = a.getByRole('dialog', { name: 'Edit task' });
  await expect(editor.getByRole('button', { name: 'Hashim!' })).toHaveAttribute('aria-pressed', 'true');
  await rail(b, 'Settings').click();
  await b.locator('.set-menu button', { hasText: /^Profiles$/ }).click();
  await b.getByRole('button', { name: 'Edit Hashim!' }).click();
  await b.getByRole('button', { name: 'Delete', exact: true }).click();
  await b.getByRole('button', { name: 'Delete profile' }).click();
  await expect(editor.getByRole('button', { name: 'Hashim!' })).toHaveCount(0);
  await editor.getByLabel('Title', { exact: true }).fill('Brush teeth well');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect
    .poll(async () => {
      const t = (await docs(household, 'tasks')).find((d) => text(d, 'title') === 'Brush teeth well');
      return t && (t.assignees as { arrayValue: { values?: Value[] } }).arrayValue.values?.map((v) => v.stringValue);
    })
    .toEqual(['asiyah']);
  expect(errors()).toEqual([]);
});

test("months of stars:a profile's history reaches past the newest thousand entries", async ({ browser }) => {
  const household = `e2e-flows-${RUN}-ledger`;
  const { page, errors } = await tablet(browser, household);
  await expect.poll(async () => (await docs(household, 'ledger')).length, { timeout: 40_000 }).toBe(4);
  // A thousand check-offs by Asiyah since Baba's starting balance (two weeks ago), written straight to the emulator.
  const root = `projects/demo-manwar/databases/(default)/documents/households/demo-${household}/ledger`;
  const at = new Date('2026-11-01T12:00').getTime();
  for (let batch = 0; batch < 2; batch++) {
    const writes = Array.from({ length: 500 }, (_, i) => {
      const n = batch * 500 + i;
      const fields = {
        id: { stringValue: `bulk${n}` },
        profileId: { stringValue: 'asiyah' },
        delta: { integerValue: '1' },
        reason: { stringValue: 'task' },
        label: { stringValue: 'Brush teeth' },
        at: { integerValue: String(at + n * 60_000) },
      };
      return { update: { name: `${root}/bulk${n}`, fields } };
    });
    const res = await fetch(`${FS.replace(/\/documents$/, '/documents:commit')}`, {
      method: 'POST',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
    });
    expect(res.ok, await res.text()).toBe(true);
  }
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  await rail(page, 'Rewards').click();
  await page.locator('[data-column="baba"] .star-pill').click();
  const sheet = page.getByRole('dialog', { name: "Baba's stars" });
  await expect(sheet.locator('.hist-balance')).toContainText('35');
  // Nothing of Baba's is among the newest thousand: the sheet says so and offers the rest.
  await expect(sheet.locator('.hist-empty')).toHaveText('Nothing recent.');
  await sheet.getByRole('button', { name: 'Show older' }).click();
  const entry = sheet.locator('.hist-entry', { hasText: 'Starting balance' });
  await expect(entry).toContainText('+35');
  // An entry read from past the live window is shown without Undo.
  await expect(entry.getByRole('button', { name: /Undo/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Show older' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a first week, from an empty household to a profile deleted and added again', async ({ page }) => {
  test.setTimeout(240_000);
  const household = `e2e-flows-${RUN}-first-week`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const go = async (now: string, extra = '') => {
    await page.goto(`/?demo=${household}&now=${now}${extra}`);
    await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  };
  const PIN = '2580';
  const pad = page.getByRole('dialog', { name: 'Parent PIN' });
  const pin = async () => {
    await expect(pad).toBeVisible();
    for (const d of PIN) await pad.getByRole('button', { name: d, exact: true }).click();
    await expect(pad).toHaveCount(0);
  };
  const col = (name: string) => page.locator('.pcol', { has: page.locator('.pcol-name', { hasText: new RegExp(`^${name}$`) }) });
  const card = (who: string, title: string, nth = 0) => col(who).locator(`.tk-card[data-task="${title}"]`).nth(nth);
  const check = async (who: string, title: string, nth = 0) => {
    await card(who, title, nth).locator('.tk-check').click();
    await expect(card(who, title, nth)).toHaveClass(/done/);
  };
  const stars = (who: string) => col(who).locator('.star-pill');

  // Monday morning: a parent sets the household up from nothing.
  await go('2026-11-02T07:30', '&seed=none');
  await rail(page, 'Settings').click();
  await page.locator('.set-menu button', { hasText: /^Profiles$/ }).click();
  for (const [name, swatch] of [
    ['Mama', 1],
    ['Zaid', 3],
    ['Maryam', 5],
  ] as const) {
    await page.getByRole('button', { name: 'Add a profile' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill(name);
    await page.locator('.swatches button').nth(swatch).click();
    await page.getByRole('button', { name: 'Create profile' }).click();
    await expect(page.locator('.profile-name', { hasText: name })).toBeVisible();
  }
  await page.locator('.set-menu button', { hasText: /^Parental lock$/ }).click();
  await page.getByRole('button', { name: /Set a PIN/ }).click();
  const setup = page.locator('.pin-setup');
  for (const d of PIN) await setup.locator('.pin-keys button', { hasText: new RegExp(`^${d}$`) }).click();
  await expect(setup).toContainText('Enter the PIN again');
  for (const d of PIN) await setup.locator('.pin-keys button', { hasText: new RegExp(`^${d}$`) }).click();
  await expect(page.getByText('The lock is on')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).first().click();

  await rail(page, 'Tasks').click();
  const addTask = async (fill: (s: Locator) => Promise<void>) => {
    await page.locator('.fab').click();
    const sheet = page.getByRole('dialog', { name: 'Add task' });
    await fill(sheet);
    await sheet.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(sheet).toHaveCount(0);
  };
  await addTask(async (s) => {
    await s.getByRole('tab', { name: /Routine/ }).click();
    await s.getByLabel('Title', { exact: true }).fill('Brush teeth');
    await s.getByRole('button', { name: 'Zaid' }).click();
    await s.getByRole('button', { name: 'Maryam' }).click();
    await s.getByRole('button', { name: /Evening/ }).click();
    await s.getByRole('button', { name: '★ 1', exact: true }).click();
  });
  await addTask(async (s) => {
    await s.getByLabel('Title', { exact: true }).fill('Feed the cat');
    await s.getByRole('button', { name: 'Maryam' }).click();
    await s.getByRole('button', { name: '★ 2', exact: true }).click();
    await s.getByRole('tab', { name: 'On a schedule' }).click();
  });
  await addTask(async (s) => {
    await s.getByLabel('Title', { exact: true }).fill('Empty dishwasher');
    await s.getByRole('switch', { name: 'Up for Grabs' }).click();
    await s.getByRole('button', { name: '★ 5', exact: true }).click();
    await s.getByRole('tab', { name: 'On a schedule' }).click();
  });
  await addTask(async (s) => {
    await s.getByLabel('Title', { exact: true }).fill('Clean room');
    await s.getByRole('button', { name: 'Zaid' }).click();
    await s.getByRole('button', { name: '★ 10', exact: true }).click();
    await s.getByRole('tab', { name: 'After it is done' }).click();
  });
  await addTask(async (s) => {
    await s.getByLabel('Title', { exact: true }).fill('Return library books');
    await s.getByRole('button', { name: 'Zaid' }).click();
  });
  await rail(page, 'Rewards').click();
  await page.locator('.fab').click();
  const reward = page.getByRole('dialog', { name: 'Add reward' });
  await reward.getByLabel('Title', { exact: true }).fill('Ice cream');
  await reward.getByLabel('Cost in stars').fill('3');
  await reward.getByRole('button', { name: 'Add', exact: true }).click();
  await rail(page, 'Meals').click();
  await page.locator('[data-cell="2026-11-02|dinner"]').click();
  const plan = page.getByRole('dialog', { name: 'Plan meal' });
  await plan.getByPlaceholder('Tacos').fill('Tacos');
  await plan.getByRole('button', { name: /Repeats/ }).click();
  await plan.getByRole('tab', { name: 'Weekly' }).click();
  await plan.getByRole('button', { name: 'Plan meal' }).click();
  await expect(page.locator('[data-cell="2026-11-02|dinner"] .mg-entry')).toContainText('Tacos');
  await expect.poll(async () => (await docs(household, 'tasks')).length).toBe(5);
  await expect.poll(async () => (await docs(household, 'meals')).length).toBe(1);
  await expect.poll(async () => (await docs(household, 'rewards')).length).toBe(1);

  // The kids, a quarter of an hour later (the reload locks the wall).
  await go('2026-11-02T07:45');
  await rail(page, 'Tasks').click();
  await check('Zaid', 'Brush teeth');
  await check('Zaid', 'Clean room');
  await check('Maryam', 'Brush teeth');
  await check('Maryam', 'Feed the cat');
  await col('Up for Grabs').locator('.tk-card[data-task="Empty dishwasher"] .tk-check').click();
  const claim = page.getByRole('dialog', { name: 'Who did it?' });
  await expect(claim).toBeVisible();
  await page.waitForTimeout(500);
  await claim.getByRole('button', { name: 'Maryam' }).click();
  await expect(stars('Zaid')).toHaveText('11');
  await expect(stars('Maryam')).toHaveText('8');
  await rail(page, 'Rewards').click();
  const zaidRewards = page.locator('.rw-col', { has: page.locator('.pcol-name', { hasText: /^Zaid$/ }) });
  await zaidRewards.locator('.rw-card[data-reward="Ice cream"] .rw-redeem').click();
  await pin();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(zaidRewards.locator('.star-pill')).toHaveText('8');
  // The demo keeps its cache in memory: let the writes reach the emulator before the next day's reload.
  await expect
    .poll(async () => (await docs(household, 'profiles')).map((p) => `${text(p, 'name')} ${num(p, 'stars')}`).sort())
    .toEqual(['Mama 0', 'Maryam 8', 'Zaid 8']);
  await expect.poll(async () => (await docs(household, 'taskStates')).length).toBe(5);

  // Tuesday: the library books are a day late, the daily chores start over, the room is done for a week.
  await go('2026-11-03T07:30');
  await rail(page, 'Tasks').click();
  await expect(card('Zaid', 'Return library books')).toContainText('1 day late');
  await expect(card('Zaid', 'Clean room')).toHaveCount(0);
  await expect(card('Maryam', 'Feed the cat')).not.toHaveClass(/done/);
  await expect(col('Up for Grabs').locator('.tk-card[data-task="Empty dishwasher"]')).not.toHaveClass(/done/);
  await expect(stars('Zaid')).toHaveText('8');

  // The next Monday: the room is due again and the meal week has rolled over with Tacos on it.
  await go('2026-11-09T07:30');
  await rail(page, 'Tasks').click();
  await expect(card('Zaid', 'Clean room')).toBeVisible();
  await expect(card('Zaid', 'Return library books')).toContainText('7 days late');
  await rail(page, 'Meals').click();
  await expect(page.locator('[data-cell="2026-11-09|dinner"] .mg-entry')).toContainText('Tacos');

  // A parent renames Zaid, deletes Maryam, then adds a new Maryam.
  await rail(page, 'Settings').click();
  await pin();
  await page.locator('.set-menu button', { hasText: /^Profiles$/ }).click();
  await page.getByRole('button', { name: 'Edit Zaid' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Zaid A.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Maryam' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete profile' }).click();
  await expect(page.locator('.profile-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add a profile' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Maryam');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.locator('.profile-row', { hasText: 'Maryam' })).toContainText('0 stars');
  await page.getByRole('button', { name: 'Close' }).first().click();

  await rail(page, 'Tasks').click();
  await expect(col('Zaid A.').locator('.tk-card[data-task="Brush teeth"]')).toHaveCount(2);
  // The new Maryam starts with nothing of the old one's: her chores were archived, not handed over.
  await expect(col('Maryam').locator('.tk-card')).toHaveCount(0);
  await expect(page.locator('.tk-card[data-task="Feed the cat"]')).toHaveCount(0);
  await expect(stars('Zaid A.')).toHaveText('8');
  await expect(stars('Maryam')).toHaveText('0');

  // Every balance on the server equals the sum of that profile's ledger.
  await expect
    .poll(async () => {
      const [profiles, ledger] = await Promise.all([docs(household, 'profiles'), docs(household, 'ledger')]);
      return profiles
        .map((p) => {
          const sum = ledger.filter((e) => text(e, 'profileId') === text(p, 'id')).reduce((s, e) => s + num(e, 'delta'), 0);
          return `${text(p, 'name')} ${num(p, 'stars')}=${sum}`;
        })
        .sort();
    })
    .toEqual(['Mama 0=0', 'Maryam 0=0', 'Zaid A. 8=8']);
  expect(errors).toEqual([]);
});

type Locator = ReturnType<Page['locator']>;
