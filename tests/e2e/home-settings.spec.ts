import { expect, test, type Page } from '@playwright/test';

const NOW = 'now=2026-11-04T11:44';
/** A fresh demo household per test, unique per run. */
const RUN = Date.now().toString(36);
let seq = 0;

const errors = new WeakMap<Page, string[]>();

async function open(page: Page): Promise<void> {
  const list: string[] = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(String(e)));
  await page.goto(`/?demo=e2e-home-${RUN}-${++seq}&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
}

test.afterEach(({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
});

const rail = (page: Page, label: string) => page.locator('.rail button', { hasText: label });
const digit = (scope: ReturnType<Page['locator']>, d: string) =>
  scope.locator('.pin-keys button', { hasText: new RegExp(`^${d}$`) });

async function openSettings(page: Page, section: string) {
  await rail(page, 'Settings').click();
  await page.locator('.set-menu button', { hasText: new RegExp(`^${section}$`) }).click();
}

test('Home shows the calendar, tasks and lists panes; Customize turns side panes off', async ({ page }) => {
  await open(page);
  await rail(page, 'Home').click();
  await expect(page.locator('.home-pane')).toHaveCount(3);
  await expect(page.locator('.home-pane h2')).toHaveText(['Calendar', "Today's tasks", 'Lists']);
  await page.getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('switch', { name: 'Tasks' }).click();
  await expect(page.locator('.home-tasks')).toHaveCount(0);
  await expect(page.locator('.home-lists')).toBeVisible();
  await page.getByRole('switch', { name: 'Tasks' }).click();
  await expect(page.locator('.home-tasks')).toBeVisible();
});

test('adds, edits, reorders and deletes a profile', async ({ page }) => {
  await open(page);
  await openSettings(page, 'Profiles');
  await expect(page.locator('.profile-row')).toHaveCount(4);

  await page.getByRole('button', { name: 'Add a profile' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Zaid');
  await page.locator('.swatches button').nth(3).click();
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.locator('.profile-row')).toHaveCount(5);
  await expect(page.locator('.profile-name').last()).toHaveText('Zaid');

  await page.getByRole('button', { name: 'Edit Zaid' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Zaid!');
  await page.locator('input[type=date]').fill('2019-03-07');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.profile-row', { hasText: 'Zaid!' })).toContainText('Birthday Mar 7');

  await page.getByRole('button', { name: 'Move Zaid! up' }).click();
  await expect(page.locator('.profile-name').nth(3)).toHaveText('Zaid!');

  await page.getByRole('button', { name: 'Edit Zaid!' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.modal')).toContainText('Star history stays in the ledger');
  await page.getByRole('button', { name: 'Delete profile' }).click();
  await expect(page.locator('.profile-row')).toHaveCount(4);
  await expect(page.locator('.profile-row', { hasText: 'Zaid' })).toHaveCount(0);
});

test('a profile avatar is picked from faces, people and animals; tasks keep their chore icons', async ({ page }) => {
  await open(page);
  await openSettings(page, 'Profiles');
  await page.getByRole('button', { name: 'Add a profile' }).click();
  const tabs = page.locator('.set-page .emoji-grid').locator('xpath=..').getByRole('tab');
  await expect(tabs).toHaveText(['Faces', 'People', 'Animals']);
  await expect(page.locator('.emoji-grid button', { hasText: '🧹' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Animals' }).click();
  await page.locator('.emoji-grid button', { hasText: '🦁' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Zaid');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.locator('.profile-row', { hasText: 'Zaid' }).locator('.avatar')).toHaveText('🦁');
  await page.getByRole('button', { name: 'Close' }).click();

  await rail(page, 'Tasks').click();
  await page.locator('.fab').click();
  await page.getByRole('button', { name: 'Add an emoji' }).click();
  await expect(page.locator('.sheet .tk-ed-picker').getByRole('tab').first()).toHaveText('Routines');
});

test('deleting a profile sends the events only it had to the unassigned queue', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page);
  const badgeOf = (p: Page) => p.locator('.rail button', { hasText: 'Calendar' }).locator('.badge');
  // The demo has three unassigned events (once its seed has landed); Nap, Swim lesson and the birthday are Hashim's alone.
  await expect(badgeOf(page)).toHaveText('3', { timeout: 40_000 });
  await openSettings(page, 'Profiles');
  await page.getByRole('button', { name: 'Edit Hashim' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.modal')).toContainText('3 events assigned only to Hashim! will wait in the unassigned queue');
  await page.getByRole('button', { name: 'Delete profile' }).click();
  await expect(badgeOf(page)).toHaveText('6');
  // The server took the writes: another tablet on the household (its own memory cache) shows the same.
  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(other.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(badgeOf(other)).toHaveText('6', { timeout: 30_000 });
  await other.close();
});

test('a PIN locks settings changes until a parent enters it, and can be removed', async ({ page }) => {
  await open(page);
  await rail(page, 'Home').click();
  await openSettings(page, 'Parental lock');
  await page.getByRole('button', { name: /Set a PIN/ }).click();
  const setup = page.locator('.pin-setup');
  for (const d of '1234') await digit(setup, d).click();
  await expect(setup).toContainText('Enter the PIN again');
  for (const d of '1234') await digit(setup, d).click();
  await expect(page.getByText('The lock is on')).toBeVisible();
  await page.getByRole('button', { name: 'Lock now' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);

  // A settings change outside the sheet asks for the PIN and waits for it.
  await page.getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('switch', { name: 'Lists' }).click();
  const pad = page.locator('.modal', { hasText: 'Parent PIN' });
  await expect(pad).toBeVisible();
  await expect(page.locator('.home-lists')).toBeVisible();
  for (const d of '1234') await digit(pad, d).click();
  await expect(pad).toHaveCount(0);
  await expect(page.locator('.home-lists')).toHaveCount(0);
  await page.locator('.popover-scrim').click();

  // Locked again, Settings itself asks for the PIN; a wrong one does not open it.
  await openSettings(page, 'Parental lock');
  await page.getByRole('button', { name: 'Lock now' }).click();
  await rail(page, 'Settings').click();
  await expect(pad).toBeVisible();
  for (const d of '9999') await digit(pad, d).click();
  await expect(pad.locator('.pin-dots.shake')).toBeVisible();
  await expect(pad.locator('.pin-dots span.on')).toHaveCount(0);
  await pad.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);

  // With the PIN, remove it; Settings then opens without one.
  await rail(page, 'Settings').click();
  for (const d of '1234') await digit(pad, d).click();
  await page.locator('.set-menu button', { hasText: /^Parental lock$/ }).click();
  await page.getByRole('button', { name: 'Remove PIN' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Remove PIN' }).click();
  await expect(page.getByText('The lock is off')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await rail(page, 'Settings').click();
  await expect(page.locator('.sheet')).toBeVisible();
  await expect(pad).toHaveCount(0);
});

test('hides a tab, keeping Home or Calendar on', async ({ page }) => {
  await open(page);
  await openSettings(page, 'Display');
  await page.getByRole('switch', { name: 'Rewards' }).click();
  await expect(rail(page, 'Rewards')).toHaveCount(0);

  await page.getByRole('switch', { name: 'Home', exact: true }).click();
  await expect(rail(page, 'Home')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: /^Calendar/ })).toBeDisabled();
  await page.getByRole('switch', { name: 'Home', exact: true }).click();
  await expect(rail(page, 'Home')).toHaveCount(1);
  await expect(page.getByRole('switch', { name: /^Calendar/ })).toBeEnabled();
});

test('the message composer and a new event open with their text field focused', async ({ page }) => {
  await open(page);
  await rail(page, 'Home').click();
  await page.getByRole('button', { name: 'Message' }).click();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeFocused();
  await page.keyboard.type('Hi');
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('Hi');
  await page.locator('.sheet').getByRole('button', { name: 'Cancel' }).click();

  await rail(page, 'Calendar').click();
  await page.locator('.fab').click();
  await expect(page.locator('.sheet input[name=title]')).toBeFocused();
});

test('posts a message that shows full screen until someone taps OK', async ({ page }) => {
  await open(page);
  await rail(page, 'Home').click();
  await page.getByRole('button', { name: 'Message' }).click();
  await page.getByRole('textbox', { name: 'Message' }).fill('Dinner at 7!');
  await page.locator('.sheet .picker button', { hasText: 'Mamma' }).click();
  await page.getByRole('button', { name: 'Post to the wall' }).click();
  const note = page.getByRole('dialog', { name: 'Message' });
  await expect(note).toContainText('Dinner at 7!');
  await expect(note).toContainText('From: Mamma');
  await expect(note).toContainText('just now');
  await note.getByRole('button', { name: 'OK!' }).click();
  await expect(note).toHaveCount(0);
});

test('runs a short timer to the end', async ({ page }) => {
  await open(page);
  await page.clock.install();
  await rail(page, 'Home').click();
  await page.getByRole('button', { name: 'Timer' }).click();
  await digit(page.locator('.modal'), '1').click();
  await page.getByRole('button', { name: 'Start' }).click();
  const layer = page.locator('.timer-layer');
  await expect(layer).toBeVisible();
  await expect(layer.locator('.timer-total')).toContainText('1 min');
  await page.clock.fastForward('00:33');
  await expect(layer.locator('.timer-clock')).toHaveAttribute('aria-label', /^0 minutes \d+ seconds left$/);
  await expect(layer.locator('.timer-pie')).toHaveAttribute('data-stage', /green|orange/);
  await page.clock.fastForward('00:40');
  await expect(layer).toContainText("Time's up");
  await layer.getByRole('button', { name: 'Done' }).click();
  await expect(layer).toHaveCount(0);
});

test('the timer readout says one minute, not one mins', async ({ page }) => {
  await open(page);
  await page.clock.install();
  await rail(page, 'Home').click();
  await page.getByRole('button', { name: 'Timer' }).click();
  await digit(page.locator('.modal'), '2').click();
  await page.getByRole('button', { name: 'Start' }).click();
  const clock = page.locator('.timer-layer .timer-clock');
  await page.clock.fastForward('00:45');
  await expect(clock).toHaveAttribute('aria-label', /^1 minute \d+ seconds left$/);
  await expect(clock.locator('small').first()).toHaveText('min');
});

test('a running timer holds off scheduled sleep until 5 minutes after it ends', async ({ page }) => {
  await open(page);
  await page.clock.install();
  // A sleep window around now: the screen sleeps once nobody has touched it for 3 minutes.
  await rail(page, 'Sleep').click();
  await page.locator('.modal .set-switch').click();
  await page.getByRole('textbox', { name: 'From' }).fill('11:00');
  await page.getByRole('textbox', { name: 'To' }).fill('13:00');
  await page.getByRole('button', { name: 'Save' }).click();
  const sleepScreen = page.locator('.sleep-screen');
  await page.clock.fastForward('03:05');
  await expect(sleepScreen).toBeVisible();

  await sleepScreen.click();
  await rail(page, 'Home').click();
  await page.getByRole('button', { name: 'Timer' }).click();
  await digit(page.locator('.modal'), '9').click();
  await page.getByRole('button', { name: 'Start' }).click();
  // Past the 3-minute tap wake, the timer keeps the screen on.
  await page.clock.fastForward('04:00');
  await expect(page.locator('.timer-layer')).toBeVisible();
  await expect(sleepScreen).toHaveCount(0);

  await page.locator('.timer-close').click();
  await page.clock.fastForward('04:00');
  await expect(sleepScreen).toHaveCount(0);
  await page.clock.fastForward('02:00');
  await expect(sleepScreen).toBeVisible();
});

test('Sleep now blanks the screen until a tap', async ({ page }) => {
  await open(page);
  await rail(page, 'Sleep').click();
  await page.getByRole('button', { name: 'Enter sleep mode now' }).click();
  const sleepScreen = page.locator('.sleep-screen');
  await expect(sleepScreen).toBeVisible();
  await sleepScreen.click();
  await expect(sleepScreen).toHaveCount(0);
});
