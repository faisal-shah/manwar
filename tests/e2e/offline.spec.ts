import { expect, test } from '@playwright/test';

/*
 * The wall starts with the Wi-Fi down: the service worker serves the app and
 * the calendar comes from the offline snapshot. Needs the production build
 * (`npm run test:e2e` serves dist/); the dev server registers no service
 * worker, so there the test skips.
 */
test('the wall starts offline from the service worker cache', async ({ page, context }) => {
  await page.goto(`/?demo=e2e-offline-${Date.now().toString(36)}&now=2026-11-04T11:44`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  const hasWorker = await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker?.ready.then(() => true) ?? Promise.resolve(false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]),
  );
  test.skip(!hasWorker, 'no service worker (dev server)');
  // Let the worker take control and the calendar snapshot be written.
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.rail .badge')).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await page.locator('.rail button', { hasText: 'Calendar' }).click();
  // Events come from the snapshot (they are unassigned here: the demo cache is in memory).
  await expect(page.locator('.rail .badge')).toBeVisible();
  await context.setOffline(false);
});
