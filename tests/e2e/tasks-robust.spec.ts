import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * Fast fingers: double taps, taps that land while a write is still on its
 * way, the star ledger staying equal to every balance, and the households a
 * family really starts with.
 */

const NOW = 'now=2026-11-04T11:44';
const run = `${Date.now().toString(36)}`;
const FS = 'http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents';
const AUTH = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const demoName = (name: string) => `e2e-robust-${run}-${name}`;

async function open(page: Page, name: string, tab: 'Tasks' | 'Rewards' | 'Home') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=${demoName(name)}&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await page.locator('.rail button', { hasText: tab }).click();
  return errors;
}

async function openTasks(page: Page, name: string) {
  const errors = await open(page, name, 'Tasks');
  await expect(column(page, 'asiyah').locator('.tk-card').first()).toBeVisible({ timeout: 15_000 });
  return errors;
}

const column = (page: Page, id: string) => page.locator(`[data-column="${id}"]`);
const card = (page: Page, col: string, title: string) => column(page, col).locator(`.tk-card[data-task="${title}"]`);
const stars = (page: Page, col: string) => column(page, col).locator('.star-pill');

/** Two taps on the same spot, as a finger does it (about 150 ms apart). */
async function doubleTap(page: Page, target: Locator, gap = 150) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.waitForTimeout(gap);
  await page.mouse.click(x, y);
}

/** Two clicks in the same task, before the first write's snapshot can arrive. */
const clickTwiceAtOnce = (target: Locator) =>
  target.evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });

type Value = { stringValue?: string; integerValue?: string; doubleValue?: number };
async function docs(name: string, col: string): Promise<Record<string, Value>[]> {
  const res = await fetch(`${FS}/households/demo-${demoName(name)}/${col}?pageSize=1000`, { headers: AUTH });
  const body = (await res.json()) as { documents?: { fields: Record<string, Value> }[] };
  return (body.documents ?? []).map((d) => d.fields);
}
const num = (v?: Value) => Number(v?.integerValue ?? v?.doubleValue ?? 0);

/** Every balance equals the sum of that profile's ledger. */
/**
 * A document as the emulator has it. The page shows seeded data from its local
 * cache before the seed reaches the server, so poll rather than read once.
 */
async function serverDoc(name: string, col: string, match: (d: Record<string, Value>) => boolean) {
  let found: Record<string, Value> | undefined;
  await expect
    .poll(async () => {
      found = (await docs(name, col)).find(match);
      return !!found;
    })
    .toBe(true);
  return found!;
}

async function expectLedgerBalanced(name: string) {
  const [profiles, ledger] = await Promise.all([docs(name, 'profiles'), docs(name, 'ledger')]);
  for (const p of profiles) {
    const sum = ledger.filter((e) => e.profileId.stringValue === p.id.stringValue).reduce((a, e) => a + num(e.delta), 0);
    expect(num(p.stars), `${p.id.stringValue} balance vs ledger`).toBe(sum);
  }
}

test('a double tap on a check circle checks it once', async ({ page }) => {
  const errors = await openTasks(page, 'dbl-check');
  await expect(stars(page, 'asiyah')).toHaveText('128');

  // A finger's double tap: checked, not checked and unchecked again.
  await doubleTap(page, card(page, 'asiyah', 'Breakfast').locator('.tk-check'));
  await expect(card(page, 'asiyah', 'Breakfast')).toHaveClass(/done/);
  await expect(stars(page, 'asiyah')).toHaveText('130');

  // A double click with no gap: still one award (the circle drops the rest of a double tap; the store's
  // own guard against a second write in flight is covered in tests/unit/tasks-guard.test.ts).
  await card(page, 'asiyah', 'Get Ready').locator('.tk-check').dblclick();
  await expect(card(page, 'asiyah', 'Get Ready')).toHaveClass(/done/);
  await page.waitForTimeout(600);
  await expect(stars(page, 'asiyah')).toHaveText('132');
  await expect(column(page, 'asiyah').locator('.progress-pill')).toHaveText('2/11');

  // A deliberate second tap later still unchecks.
  await card(page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await expect(card(page, 'asiyah', 'Breakfast')).not.toHaveClass(/done/);
  await expect(stars(page, 'asiyah')).toHaveText('130');
  await expectLedgerBalanced('dbl-check');
  expect(errors).toEqual([]);
});

test('double taps do not close what they opened', async ({ page }) => {
  await openTasks(page, 'dbl-open');
  await doubleTap(page, card(page, '*', 'Empty dishwasher').locator('.tk-check'));
  await expect(page.getByRole('dialog', { name: 'Who did it?' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('dialog', { name: 'Who did it?' }).getByRole('button', { name: 'Cancel' }).click();

  await doubleTap(page, card(page, 'asiyah', 'Get Ready').locator('.tk-body'));
  await expect(page.getByTestId('task-details')).toBeVisible();
  // A tap outside after the guard still closes it.
  await page.waitForTimeout(500);
  await page.mouse.click(5, 990);
  await expect(page.getByTestId('task-details')).toHaveCount(0);
});

test('undo in the star history reverses a completion once', async ({ page }) => {
  await openTasks(page, 'dbl-undo');
  await card(page, 'mamma', 'Reading').locator('.tk-check').click();
  await expect(stars(page, 'mamma')).toHaveText('45');
  await stars(page, 'mamma').click();
  const sheet = page.getByRole('dialog', { name: "Mamma's stars" });
  await clickTwiceAtOnce(sheet.getByRole('button', { name: 'Undo Reading' }));
  await expect(sheet.locator('.hist-entry[data-reason="untask"]')).toHaveCount(1);
  await expect(sheet.locator('.hist-balance')).toContainText('42');
  await page.waitForTimeout(500);
  await expect(sheet.locator('.hist-entry[data-reason="untask"]')).toHaveCount(1);
  await expectLedgerBalanced('dbl-undo');
});

test('a double tap on Redeem spends the stars once and keeps the celebration up', async ({ page }) => {
  await open(page, 'dbl-redeem', 'Rewards');
  const redeemBtn = column(page, 'asiyah').locator('.rw-card[data-reward="Ice cream trip"] .rw-redeem');
  await expect(stars(page, 'asiyah')).toHaveText('128', { timeout: 15_000 });

  await doubleTap(page, redeemBtn);
  const dialog = page.getByRole('dialog', { name: 'Reward redeemed' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(stars(page, 'asiyah')).toHaveText('78');

  // Two clicks inside one task: the second sees the first's charge.
  await clickTwiceAtOnce(redeemBtn);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(stars(page, 'asiyah')).toHaveText('28');
  await page.waitForTimeout(500);
  await expect(stars(page, 'asiyah')).toHaveText('28');
  await expectLedgerBalanced('dbl-redeem');
});

test("the day's celebration plays once, not on every re-check", async ({ page }) => {
  await open(page, 'celebrate-once', 'Home');
  const baba = column(page, 'baba');
  await expect(baba.locator('.tk-card').first()).toBeVisible({ timeout: 15_000 });
  const rain = page.locator('.fx-celebrate');
  const titles = await baba.locator('.tk-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-task')!));
  expect(titles.length).toBeGreaterThan(1);
  for (const t of titles) await baba.locator(`.tk-card[data-task="${t}"] .tk-check`).click();
  await expect(rain).toContainText('Yay, Baba!');
  await expect(rain).toHaveCount(0, { timeout: 6000 });

  const last = baba.locator(`.tk-card[data-task="${titles[0]}"]`);
  for (let i = 0; i < 2; i++) {
    await last.locator('.tk-check').click();
    await expect(last).not.toHaveClass(/done/);
    await page.waitForTimeout(600);
    await last.locator('.tk-check').click();
    await expect(last).toHaveClass(/done/);
    // The rain would start 450 ms after the tap; sample past that without retrying.
    for (let t = 0; t < 12; t++) {
      expect(await rain.count()).toBe(0);
      await page.waitForTimeout(100);
    }
  }
});

test('a Home card whose tasks were all skipped is not "All done!"', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('manwar.tasksFilter.v1', JSON.stringify({ skipped: false })));
  await open(page, 'all-skipped', 'Home');
  const baba = column(page, 'baba');
  await expect(baba.locator('.tk-card').first()).toBeVisible({ timeout: 15_000 });
  const titles = await baba.locator('.tk-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-task')!));
  for (const t of titles) {
    await baba.locator(`.tk-card[data-task="${t}"] .tk-body`).click();
    await page.getByTestId('task-details').getByRole('button', { name: 'Skip' }).click();
    await expect(baba.locator(`.tk-card[data-task="${t}"]`)).toHaveCount(0);
  }
  await expect(baba.locator('.tp-empty')).toContainText('Nothing to do today.');
});

test("filling in yesterday's chore keeps it out of today's list", async ({ page }) => {
  await openTasks(page, 'backfill');
  const toys = card(page, 'hashim', 'Tidy toys');
  await expect(toys).toHaveCount(1);
  const before = await column(page, 'hashim').locator('.progress-pill').textContent();

  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.locator('.topbar .when')).toContainText('Tue, Nov 3');
  await card(page, 'hashim', 'Tidy toys').locator('.tk-check').click();
  await expect(card(page, 'hashim', 'Tidy toys')).toHaveClass(/done/);

  await page.getByRole('button', { name: 'Today' }).click();
  await expect(toys).toHaveCount(1);
  await expect(toys).not.toHaveClass(/done/);
  await expect(column(page, 'hashim').locator('.progress-pill')).toHaveText(before!);
  await expect(stars(page, 'hashim')).toHaveText('101');
});

test('unchecking takes back the stars it earned, even after the value changed', async ({ page }) => {
  await openTasks(page, 'untoast');
  await card(page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await expect(stars(page, 'asiyah')).toHaveText('130');
  // A parent raises the task's value afterwards.
  const breakfast = await serverDoc('untoast', 'tasks', (t) => t.title.stringValue === 'Breakfast');
  const res = await fetch(
    `${FS}/households/demo-${demoName('untoast')}/tasks/${breakfast.id.stringValue}?updateMask.fieldPaths=stars`,
    { method: 'PATCH', headers: AUTH, body: JSON.stringify({ fields: { stars: { integerValue: '5' } } }) },
  );
  expect(res.ok).toBe(true);
  // Hashim's Breakfast is not done, so it shows the new value; Asiyah's keeps what it earned.
  await expect(card(page, 'hashim', 'Breakfast').locator('.tk-stars')).toHaveText('5');
  await expect(card(page, 'asiyah', 'Breakfast').locator('.tk-stars')).toHaveText('2');
  await card(page, 'asiyah', 'Breakfast').locator('.tk-check').click();
  await expect(page.locator('.toast', { hasText: 'Breakfast unchecked' })).toContainText('2 stars taken back');
  await expect(stars(page, 'asiyah')).toHaveText('128');
  await expect(card(page, 'asiyah', 'Breakfast').locator('.tk-stars')).toHaveText('5');
});

test('a late chore in the week grid is open and checks off as today', async ({ page }) => {
  await openTasks(page, 'week-late');
  await expect(card(page, 'asiyah', 'Feed the fish')).toContainText('2 days late');
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.getByRole('tab', { name: 'Asiyah' }).click();
  const row = page.locator('.wk-task[data-task="Feed the fish"]');
  const monday = row.getByRole('button', { name: 'Feed the fish, 2026-11-02: open' });
  await expect(monday).toHaveClass(/late/);
  await monday.click();
  await expect(row.getByRole('button', { name: 'Feed the fish, 2026-11-02: done' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);
  await expect(page.locator('.wk-top .star-pill')).toHaveText('133');
});

test('removing stars stops at the balance', async ({ page }) => {
  await openTasks(page, 'remove');
  await stars(page, 'baba').click();
  const sheet = page.getByRole('dialog', { name: "Baba's stars" });
  await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
  await sheet.getByLabel('Number of stars').fill('36');
  await expect(sheet.getByRole('button', { name: 'Remove 36' })).toBeDisabled();
  await expect(sheet).toContainText('Enter a whole number from 1 to 35.');
  await sheet.getByLabel('Number of stars').fill('35');
  await expect(sheet).toContainText('35 → 0 stars');
  await sheet.getByRole('button', { name: 'Remove 35' }).click();
  await expect(sheet.locator('.hist-balance')).toContainText('0');
  await sheet.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(sheet).toContainText('There are no stars to remove.');
});

test('the last reward in a column scrolls clear of the + button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, 'fab', 'Rewards');
  const body = column(page, 'hashim').locator('.pcol-body');
  await expect(body.locator('.rw-card').first()).toBeVisible({ timeout: 15_000 });
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const last = (await body.locator('.rw-card').last().boundingBox())!;
  const fab = (await page.locator('.fab').boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(fab.y);
});

test('a new household with no profiles says how to start', async ({ page }) => {
  // A list makes the household non-empty, so the demo family is not seeded.
  const res = await fetch(`${FS}/households/demo-${demoName('empty')}/lists/l1`, {
    method: 'PATCH',
    headers: AUTH,
    body: JSON.stringify({
      fields: {
        id: { stringValue: 'l1' },
        title: { stringValue: 'Grocery List' },
        kind: { stringValue: 'grocery' },
        sections: { arrayValue: {} },
        isDefaultGrocery: { booleanValue: true },
        order: { integerValue: '0' },
        createdAt: { integerValue: '0' },
      },
    }),
  });
  expect(res.ok).toBe(true);
  const errors = await open(page, 'empty', 'Tasks');
  await expect(page.locator('.tk-tab')).toContainText('Add your family in Settings, under Profiles.');
  await page.getByRole('tab', { name: 'Week' }).click();
  await expect(page.locator('.tk-tab')).toContainText('Add your family in Settings, under Profiles.');
  await page.locator('.rail button', { hasText: 'Rewards' }).click();
  await expect(page.locator('.rw-tab')).toContainText('Add your family in Settings, under Profiles.');
  expect(errors).toEqual([]);
});

test('a once-only reward redeemed and undone is available again', async ({ page }) => {
  await open(page, 'once', 'Rewards');
  const book = column(page, 'asiyah').locator('.rw-card[data-reward="New book"]');
  await expect(book.locator('.rw-progress')).toHaveText('128/150', { timeout: 15_000 });
  await stars(page, 'asiyah').click();
  const sheet = page.getByRole('dialog', { name: "Asiyah's stars" });
  await sheet.getByRole('button', { name: 'Give', exact: true }).click();
  await sheet.getByRole('button', { name: '25', exact: true }).click();
  await sheet.getByRole('button', { name: 'Give 25' }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();

  await book.getByRole('button', { name: /Redeem/ }).click();
  await page.getByRole('dialog', { name: 'Reward redeemed' }).getByRole('button', { name: 'Done' }).click();
  await expect(book).toContainText('Redeemed on Nov 4');
  await expect(stars(page, 'asiyah')).toHaveText('3');

  await stars(page, 'asiyah').click();
  await sheet.getByRole('button', { name: 'Undo New book' }).click();
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(book.getByRole('button', { name: /Redeem/ })).toBeVisible();
  await expect(stars(page, 'asiyah')).toHaveText('153');
  await expectLedgerBalanced('once');
});

test('saving an editor keeps what changed while it was open', async ({ page }) => {
  await open(page, 'stale-edit', 'Rewards');
  const book = column(page, 'mamma').locator('.rw-card[data-reward="New book"]');
  await expect(book).toBeVisible({ timeout: 15_000 });
  const id = (await serverDoc('stale-edit', 'rewards', (r) => r.title.stringValue === 'New book')).id.stringValue;
  await book.getByRole('button', { name: 'New book, edit' }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit reward' });
  await expect(sheet).toBeVisible();
  // Mamma redeems it on another device while the editor is open.
  const res = await fetch(
    `${FS}/households/demo-${demoName('stale-edit')}/rewards/${id}?updateMask.fieldPaths=redeemedBy.mamma`,
    {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({ fields: { redeemedBy: { mapValue: { fields: { mamma: { integerValue: '1793814240000' } } } } } }),
    },
  );
  expect(res.ok).toBe(true);
  await sheet.getByLabel('Title', { exact: true }).fill('New book!');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(column(page, 'mamma').locator('.rw-card[data-reward="New book!"]')).toContainText('Redeemed on');
});

test('paging back stops where the task history ends', async ({ page }) => {
  await openTasks(page, 'history');
  const old = {
    id: { stringValue: 'old' },
    kind: { stringValue: 'routine' },
    title: { stringValue: 'Old routine' },
    assignees: { arrayValue: { values: [{ stringValue: 'hashim' }] } },
    upForGrabs: { booleanValue: false },
    stars: { integerValue: '7' },
    date: { stringValue: '2026-01-01' },
    repeat: { mapValue: { fields: { every: { integerValue: '1' }, unit: { stringValue: 'day' } } } },
    parts: { arrayValue: { values: [{ stringValue: 'morning' }] } },
    order: { integerValue: '99' },
    createdAt: { integerValue: '0' },
  };
  const res = await fetch(`${FS}/households/demo-${demoName('history')}/tasks/old`, {
    method: 'PATCH',
    headers: AUTH,
    body: JSON.stringify({ fields: old }),
  });
  expect(res.ok).toBe(true);
  await expect(card(page, 'hashim', 'Old routine')).toBeVisible();

  const prev = page.getByRole('button', { name: 'Previous day' });
  for (let i = 0; i < 60; i++) await prev.click();
  await expect(page.locator('.topbar .when')).toContainText('Sat, Sep 5');
  await expect(prev).toBeDisabled();

  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.getByRole('tab', { name: 'Hashim!' }).click();
  const prevWeek = page.getByRole('button', { name: 'Previous week' });
  for (let i = 0; i < 9; i++) await prevWeek.click();
  await expect(prevWeek).toBeDisabled();
  await expect(page.locator('.topbar .when')).toContainText('Aug 30 - Sep 5');
  // Sep 5 is the first day of the history; the days before it stay blank.
  await expect(page.locator('.wk-task[data-task="Old routine"] .wk-dot')).toHaveCount(1);
});

test('a skipped repeat-after-done chore comes round again', async ({ page }) => {
  await openTasks(page, 'skip-after');
  const sheets = card(page, 'baba', 'Change bed sheets');
  await sheets.locator('.tk-body').click();
  await page.getByTestId('task-details').getByRole('button', { name: 'Skip' }).click();
  await expect(sheets).toHaveClass(/skipped/);
  const next = page.getByRole('button', { name: 'Next day' });
  for (let i = 0; i < 14; i++) await next.click();
  await expect(page.locator('.topbar .when')).toContainText('Wed, Nov 18');
  await expect(sheets).toHaveCount(1);
  await expect(sheets).not.toHaveClass(/skipped/);

  // Unskipping puts it back as late today.
  await page.getByRole('button', { name: 'Today' }).click();
  await sheets.locator('.tk-body').click();
  await page.getByTestId('task-details').getByRole('button', { name: 'Unskip' }).click();
  await expect(sheets).not.toHaveClass(/skipped/);
  await expect(sheets).toContainText('1 day late');
});

test('a chore that repeats after it is done, added after dinner, is not late the next morning', async ({ page }) => {
  const name = demoName('after-evening');
  await page.goto(`/?demo=${name}&now=2026-11-04T20:40`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(column(page, 'asiyah').locator('.tk-card').first()).toBeVisible({ timeout: 15_000 });
  await page.locator('.fab').click();
  const sheet = page.locator('.sheet');
  await sheet.getByRole('textbox', { name: 'Title' }).fill('Clean the fish tank');
  await sheet.locator('.picker button', { hasText: 'Asiyah' }).click();
  await sheet.getByRole('tab', { name: 'After it is done' }).click();
  await expect(sheet.getByLabel('Date')).toHaveValue('2026-11-05');
  await expect(sheet).toContainText('First due tomorrow');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect
    .poll(async () => (await docs('after-evening', 'tasks')).some((t) => t.title?.stringValue === 'Clean the fish tank'))
    .toBe(true);

  await page.goto(`/?demo=${name}&now=2026-11-05T07:15`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await page.locator('.rail button', { hasText: 'Tasks' }).click();
  const tank = card(page, 'asiyah', 'Clean the fish tank');
  await expect(tank).toBeVisible({ timeout: 15_000 });
  await expect(tank).not.toContainText('late');
});
