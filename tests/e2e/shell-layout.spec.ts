import { expect, test, type Locator, type Page } from '@playwright/test';

/* Extreme but valid inputs stay inside their boxes. */

const NOW = 'now=2026-11-04T11:44';
const RUN = Date.now().toString(36);
let seq = 0;

const rail = (page: Page, label: string) => page.locator('.rail button', { hasText: label });
const digit = (scope: Locator, d: string) => scope.locator('.pin-keys button', { hasText: new RegExp(`^${d}$`) });
const box = async (l: Locator) => (await l.boundingBox())!;

async function open(page: Page): Promise<void> {
  await page.goto(`/?demo=e2e-layout-${RUN}-${++seq}&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
}

/** The longest name the editor takes, in the widest letter, with no space to break at. */
const LONG_NAME = 'W'.repeat(30);

test('a long one-word profile name wraps instead of running under the row buttons', async ({ page }) => {
  await open(page);
  await rail(page, 'Settings').click();
  await page.getByRole('button', { name: 'Add a profile' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(LONG_NAME);
  const preview = await box(page.locator('.profile-preview > span:last-child'));
  const page_ = await box(page.locator('.set-page'));
  expect(preview.x + preview.width).toBeLessThanOrEqual(page_.x + page_.width + 1);
  await page.getByRole('button', { name: 'Create profile' }).click();

  const row = page.locator('.profile-row', { hasText: LONG_NAME });
  const name = await box(row.locator('.profile-name'));
  const up = await box(row.getByRole('button', { name: `Move ${LONG_NAME} up` }));
  expect(name.x + name.width).toBeLessThanOrEqual(up.x);
});

test('the longest message fits its note with the name and OK! on it', async ({ page }) => {
  await open(page);
  await rail(page, 'Home').click();
  await page.getByRole('button', { name: 'Message' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('W'.repeat(220));
  await page.locator('.sheet .picker button').first().click();
  await page.getByRole('button', { name: 'Post to the wall' }).click();
  // Everything sits inside the note's padding (the fold corner and the edges stay clear).
  await page.locator('.message-note').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  const note = await box(page.locator('.message-note'));
  const pad = await page.locator('.message-note').evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));
  for (const part of ['.message-text', '.message-meta', '.message-ok']) {
    const b = await box(page.locator(part));
    expect(b.y, part).toBeGreaterThanOrEqual(note.y + pad - 1);
    expect(b.y + b.height, part).toBeLessThanOrEqual(note.y + note.height - pad + 1);
  }
});

test('a 999-minute timer readout stays clear of the pie and says it ends tomorrow', async ({ page }) => {
  await open(page);
  await rail(page, 'Home').click();
  await page.getByRole('button', { name: 'Timer' }).click();
  const pad = page.locator('.modal');
  for (const d of '999') await digit(pad, d).click();
  await page.getByRole('button', { name: 'Start' }).click();
  const layer = page.locator('.timer-layer');
  await expect(layer.locator('.timer-clock')).toBeVisible();
  const pie = await box(layer.locator('.timer-pie'));
  const clock = await box(layer.locator('.timer-clock'));
  // The readout's top-right corner, the one nearest the pie, is outside its circle.
  const r = pie.width / 2;
  const dx = clock.x + clock.width - (pie.x + r);
  const dy = clock.y - (pie.y + r);
  expect(Math.hypot(dx, dy)).toBeGreaterThan(r);
  await expect(layer.locator('.timer-total')).toContainText('16 hr 39 min · ends tomorrow 4:23 AM');
});
