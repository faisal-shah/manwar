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
