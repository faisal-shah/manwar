import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const NOW = 'now=2026-11-04T11:44';
const run = `${Date.now().toString(36)}`;
const PIN = '1234';

/** Sets the parent PIN the way core/lock.ts stores it, straight into the Firestore emulator. */
async function setPin(demo: string, pin: string) {
  const salt = 'e2e-salt';
  const pinHash = createHash('sha256').update(`${salt}:${pin}`).digest('hex');
  const url =
    `http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents/households/demo-${demo}` +
    '/settings/main?updateMask.fieldPaths=lock';
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        lock: {
          mapValue: {
            fields: { salt: { stringValue: salt }, pinHash: { stringValue: pinHash }, relockMinutes: { integerValue: '2' } },
          },
        },
      },
    }),
  });
  expect(res.ok, await res.text()).toBe(true);
}

/** Opens a fresh demo household with a parent PIN, on the given tab. */
async function open(page: Page, name: string, tab: 'Rewards' | 'Tasks') {
  const demo = `e2e-rewards-${run}-${name}`;
  await page.goto(`/?demo=${demo}&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await page.locator('.rail button', { hasText: tab }).click();
  await expect(page.locator('[data-column="asiyah"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-column="asiyah"] .star-pill')).toHaveText('128', { timeout: 15_000 });
  await setPin(demo, PIN);
}

async function enterPin(page: Page) {
  const pad = page.getByRole('dialog', { name: 'Parent PIN' });
  await expect(pad).toBeVisible();
  for (const d of PIN) await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(pad).toHaveCount(0);
}

const column = (page: Page, id: string) => page.locator(`[data-column="${id}"]`);
const stars = (page: Page, id: string) => column(page, id).locator('.star-pill');
const reward = (page: Page, col: string, title: string) => column(page, col).locator(`.rw-card[data-reward="${title}"]`);

test('redeeming asks for the PIN, celebrates, and undoes from the history', async ({ page }) => {
  await open(page, 'redeem', 'Rewards');
  await expect(reward(page, 'mamma', 'Ice cream trip').locator('.rw-progress')).toHaveText('42/50');
  await expect(reward(page, 'mamma', 'Stay up 30 minutes late')).toHaveCount(0);

  await reward(page, 'asiyah', 'Ice cream trip')
    .getByRole('button', { name: /Redeem/ })
    .click();
  await enterPin(page);
  const dialog = page.getByRole('dialog', { name: 'Reward redeemed' });
  await expect(dialog).toContainText('Great work! Ice cream trip redeemed');
  await expect(dialog).toContainText('By Asiyah for 50 stars on November 4, 2026.');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(stars(page, 'asiyah')).toHaveText('78');
  await expect(reward(page, 'asiyah', 'Ice cream trip').getByRole('button', { name: /Redeem/ })).toBeVisible();
  await expect(reward(page, 'asiyah', 'Movie night pick').locator('.rw-progress')).toHaveText('78/100');

  await stars(page, 'asiyah').click();
  const sheet = page.getByRole('dialog', { name: "Asiyah's stars" });
  const entry = sheet.locator('.hist-entry[data-reason="redeem"]');
  await expect(entry).toContainText('−50');
  await entry.getByRole('button', { name: 'Undo Ice cream trip' }).click();
  await expect(entry).toHaveClass(/undone/);
  await expect(sheet.locator('.hist-balance')).toContainText('128');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(stars(page, 'asiyah')).toHaveText('128');
});

test('giving stars unlocks a once-only reward, which then shows as redeemed', async ({ page }) => {
  await open(page, 'give', 'Rewards');
  await expect(reward(page, 'asiyah', 'New book').locator('.rw-progress')).toHaveText('128/150');
  await stars(page, 'asiyah').click();
  const sheet = page.getByRole('dialog', { name: "Asiyah's stars" });
  await sheet.getByRole('button', { name: 'Give', exact: true }).click();
  await enterPin(page);
  await sheet.getByRole('button', { name: '25', exact: true }).click();
  await sheet.getByPlaceholder(/Note/).fill('Helped with groceries');
  await expect(sheet).toContainText('128 → 153 stars');
  await sheet.getByRole('button', { name: 'Give 25' }).click();
  await expect(sheet.locator('.hist-entry').first()).toContainText('Helped with groceries');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(stars(page, 'asiyah')).toHaveText('153');

  await reward(page, 'asiyah', 'New book')
    .getByRole('button', { name: /Redeem/ })
    .click();
  await page.getByRole('dialog', { name: 'Reward redeemed' }).getByRole('button', { name: 'Done' }).click();
  await expect(reward(page, 'asiyah', 'New book')).toContainText('Redeemed on Nov 4');
  await expect(reward(page, 'mamma', 'New book').locator('.rw-progress')).toBeVisible();
  await page.getByRole('button', { name: 'Hide redeemed' }).click();
  await expect(reward(page, 'asiyah', 'New book')).toHaveCount(0);
});

test('a parent adds a reward for everyone', async ({ page }) => {
  await open(page, 'add', 'Rewards');
  await page.locator('.fab').click();
  await enterPin(page);
  const sheet = page.getByRole('dialog', { name: 'Add reward' });
  await sheet.getByLabel('Title', { exact: true }).fill('Bike ride');
  await sheet.getByLabel('Cost in stars').fill('0');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('between 1 and 10,000');
  await sheet.getByLabel('Cost in stars').fill('40');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  for (const id of ['asiyah', 'mamma', 'baba', 'hashim']) await expect(reward(page, id, 'Bike ride')).toHaveCount(1);
  await expect(reward(page, 'mamma', 'Bike ride').getByRole('button', { name: /Redeem/ })).toBeVisible();
  await expect(reward(page, 'baba', 'Bike ride').locator('.rw-progress')).toHaveText('35/40');
});

test('with a PIN set, kids check off tasks but adding needs the PIN', async ({ page }) => {
  await open(page, 'kid', 'Tasks');
  await column(page, 'asiyah').locator('.tk-card[data-task="Breakfast"] .tk-check').click();
  await expect(column(page, 'asiyah').locator('.tk-card[data-task="Breakfast"]')).toHaveClass(/done/);
  await expect(page.getByRole('dialog', { name: 'Parent PIN' })).toHaveCount(0);
  await expect(stars(page, 'asiyah')).toHaveText('130');

  await page.locator('.fab').click();
  const pad = page.getByRole('dialog', { name: 'Parent PIN' });
  await expect(pad).toBeVisible();
  await pad.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Add task' })).toHaveCount(0);
});
