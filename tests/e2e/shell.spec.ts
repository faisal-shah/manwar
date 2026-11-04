import { expect, test } from '@playwright/test';

const NOW = 'now=2026-11-04T11:44';

test('demo household loads with every tab', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=e2e-shell&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.topbar .when')).toContainText('Wed, Nov 4');
  for (const label of ['Home', 'Calendar', 'Lists', 'Tasks', 'Rewards', 'Meals', 'Recipes']) {
    await page.locator('.rail button', { hasText: label }).click();
    await expect(page.locator('.rail button.on')).toContainText(label);
  }
  expect(errors).toEqual([]);
});
