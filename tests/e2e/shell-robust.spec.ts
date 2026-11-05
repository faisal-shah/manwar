import { expect, test, type Page } from '@playwright/test';

/*
 * The wall left running for weeks: first run, offline boots, idle return,
 * sleep, and Google connection problems.
 */

const NOW = 'now=2026-11-04T11:44';
const RUN = Date.now().toString(36);
let seq = 0;
const household = () => `e2e-shell-${RUN}-${++seq}`;

const rail = (page: Page, label: string) => page.locator('.rail button', { hasText: label });

async function open(page: Page, extra = ''): Promise<string> {
  const name = household();
  await page.goto(`/?demo=${name}&${NOW}${extra}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  return name;
}

async function openSettings(page: Page, section: string) {
  await rail(page, 'Settings').click();
  await page.locator('.set-menu button', { hasText: new RegExp(`^${section}$`) }).click();
}

test('a first-run household shows how to add people, and the button opens Profiles', async ({ page }) => {
  await open(page, '&seed=none');
  await rail(page, 'Tasks').click();
  const prompt = page.locator('.no-profiles');
  await expect(prompt).toContainText('Add the people in your family');
  await expect(page.getByText('Every profile is hidden')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Week' }).click();
  await expect(prompt).toBeVisible();
  await rail(page, 'Rewards').click();
  await expect(prompt).toContainText('stars and rewards');
  await rail(page, 'Home').click();
  await expect(page.locator('.home-tasks .no-profiles')).toBeVisible();

  await page.locator('.home-tasks').getByRole('button', { name: 'Add people' }).click();
  await expect(page.locator('.set-menu button.on')).toHaveText('Profiles');
  await page.getByRole('button', { name: 'Add a profile' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Zaid');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.home-tasks .no-profiles')).toHaveCount(0);
  await expect(page.locator('.home-tasks .tp-card', { hasText: 'Zaid' })).toBeVisible();
});

test('a tablet that boots offline with an expired sign-in still opens its household', async ({ page }) => {
  await open(page);
  // Expire the stored ID token, then cut the token refresh (the Wi-Fi is not up yet).
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('firebaseLocalStorageDb');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction('firebaseLocalStorage', 'readwrite');
    const store = tx.objectStore('firebaseLocalStorage');
    const all = await new Promise<{ fbase_key: string; value: { stsTokenManager: { expirationTime: number } } }[]>((resolve) => {
      const q = store.getAll();
      q.onsuccess = () => resolve(q.result);
    });
    const user = all.find((x) => x.fbase_key.startsWith('firebase:authUser'))!;
    user.value.stsTokenManager.expirationTime = Date.now() - 60_000;
    store.put(user);
    await new Promise((resolve) => (tx.oncomplete = resolve));
  });
  await page.route('**/securetoken.googleapis.com/**', (r) => r.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.connect')).toHaveCount(0);
});

test('typing counts as activity: idle return does not pull the wall away from an editor', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await openSettings(page, 'Display');
  await page.getByRole('tab', { name: '1 min' }).click();
  await page.getByRole('button', { name: 'Close' }).click();

  await rail(page, 'Recipes').click();
  await page.locator('.fab').click();
  const steps = page.getByPlaceholder('One step per line, or a paragraph');
  await steps.click();
  // Two minutes of typing on the keyboard, no taps.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.type('Stir. ');
    await page.clock.fastForward('00:30');
  }
  await expect(rail(page, 'Recipes')).toHaveClass(/on/);
  await expect(steps).toHaveValue('Stir. Stir. Stir. Stir. ');

  // Left alone, the wall goes Home.
  await page.clock.fastForward('01:20');
  await expect(rail(page, 'Home')).toHaveClass(/on/);
});

test('idle return closes a Settings sheet left open', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await openSettings(page, 'Display');
  await page.getByRole('tab', { name: '1 min' }).click();
  await page.clock.fastForward('01:20');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(rail(page, 'Home')).toHaveClass(/on/);
});

test('someone using the wall keeps scheduled sleep off until they stop', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await rail(page, 'Sleep').click();
  await page.locator('.modal .set-switch').click();
  await page.getByRole('textbox', { name: 'From' }).fill('11:00');
  await page.getByRole('textbox', { name: 'To' }).fill('13:00');
  await page.getByRole('button', { name: 'Save' }).click();
  const sleepScreen = page.locator('.sleep-screen');
  // Inside the window, but someone just touched the wall.
  await expect(sleepScreen).toHaveCount(0);
  for (let i = 0; i < 3; i++) {
    await page.clock.fastForward('02:00');
    await rail(page, i % 2 ? 'Lists' : 'Calendar').click();
  }
  await expect(sleepScreen).toHaveCount(0);
  await page.clock.fastForward('03:05');
  await expect(sleepScreen).toBeVisible();

  // A tap wakes it, and it stays awake while in use.
  await sleepScreen.click();
  await expect(sleepScreen).toHaveCount(0);
  await page.clock.fastForward('02:30');
  await rail(page, 'Home').click();
  await page.clock.fastForward('02:30');
  await expect(sleepScreen).toHaveCount(0);
  await page.clock.fastForward('01:00');
  await expect(sleepScreen).toBeVisible();
});

test('Sleep now survives a reload of the page', async ({ page }) => {
  await open(page);
  await rail(page, 'Sleep').click();
  await page.getByRole('button', { name: 'Enter sleep mode now' }).click();
  await expect(page.locator('.sleep-screen')).toBeVisible();
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.sleep-screen')).toBeVisible();
  await page.locator('.sleep-screen').click();
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.sleep-screen')).toHaveCount(0);
});

test('a Google connection that needs a reconnect shows on the wall and leads to Settings', async ({ page }) => {
  test.skip(!process.env.PW_BASE, 'calls the session module through the dev server');
  await open(page);
  await expect(page.locator('.sync-status')).toHaveCount(0);
  // The demo household has no Google connection, so the token Function refuses it.
  const message = await page.evaluate(async () => {
    // The app's own instance of the module (after an edit, Vite serves it with a ?t= stamp).
    const url = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .find((n) => new URL(n).pathname === '/src/data/session.ts')!;
    const s = await import(/* @vite-ignore */ url);
    return s.googleAccessToken().then(
      () => 'no error',
      (e: Error) => e.message,
    );
  });
  expect(message).toBe('Google is not connected. Connect the Google account again.');
  const chip = page.locator('.sync-status.bad');
  await expect(chip).toHaveText('Reconnect Google Calendar');
  await chip.click();
  await expect(page.locator('.set-menu button.on')).toHaveText('Google Calendar');
  await expect(page.locator('.set-page')).toContainText('Google is not connected. Connect the Google account again.');
  await expect(page.locator('.set-page').getByRole('button', { name: 'Reconnect' })).toBeVisible();
});
