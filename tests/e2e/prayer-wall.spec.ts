import { expect as baseExpect, test, type Page } from '@playwright/test';
import { devices } from '@playwright/test';
import { newContext } from './phone-helpers';
import { face, mainDoc, openWall, prayerDoc, writeFields } from './prayer-helpers';

/*
 * The wall's two faces together (app/face.ts, prayer/stage.ts): the athan
 * sequence over the family face, the switch buttons, a note or timer from a
 * phone bringing the family face, idle and sleep returning to the resting
 * face, and the wall's sounds waiting for the athan. Chicago, 29 October
 * 2026: Dhuhr 12:35.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 90_000 });

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

const family = (page: Page) => page.locator('.shell');
const rail = (page: Page, name: string) => page.locator('.rail button', { hasText: name });
const appInert = (page: Page) => page.evaluate(() => document.getElementById('app')!.inert);

/** A note for the wall, as a phone posts it. */
async function postNote(household: string, text: string) {
  const id = `note-${Date.now().toString(36)}`;
  await writeFields(household, `messages/${id}`, { id, text, createdAt: Date.now() });
}

/** The synthesized sounds the wall starts (core/sound.ts), counted from before the page loads. */
async function countTones(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number };
    w.__tones = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      w.__tones++;
      return orig.call(this);
    };
  });
  return () => page.evaluate(() => (window as unknown as { __tones: number }).__tones);
}

test('the athan sequence comes over the family face, which is inert under it, and hands it back', async ({ page }) => {
  // Seconds before Dhuhr's one-minute countdown (12:34).
  const { errors } = await openWall(page, '2026-10-29T12:33:56', {}, { face: 'family' });
  await expect(family(page)).toBeVisible();
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(face(page).locator('.tk-count')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('data-face', 'prayer');
  expect(await appInert(page)).toBe(true);
  // Nothing of the family face takes focus under it.
  expect(
    await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('.rail button')!;
      b.focus();
      return document.activeElement === b;
    }),
  ).toBe(false);
  // No switch button during the sequence: its own close is the way out.
  await expect(face(page).locator('.face-switch')).toHaveCount(0);
  await expect(face(page).locator('.tk-athan')).toBeVisible({ timeout: 70_000 });
  await face(page).getByRole('button', { name: 'Stop the athan' }).click();
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-face', 'family');
  expect(await appInert(page)).toBe(false);
  await expect(rail(page, 'Calendar')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the rail and the calendar button switch between the faces', async ({ page }) => {
  const { errors } = await openWall(page, '2026-10-29T14:53:00', {}, { face: 'family' });
  await rail(page, 'Prayer').click();
  await expect(face(page).locator('.cl')).toBeVisible();
  await face(page).getByRole('button', { name: 'Family calendar' }).click();
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(rail(page, 'Prayer')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a note from a phone brings the family face', async ({ page }) => {
  const { household, errors } = await openWall(page, '2026-10-29T14:53:00');
  await expect(face(page).locator('.cl')).toBeVisible();
  await postNote(household, 'Dinner at six');
  await expect(page.locator('.message-layer')).toContainText('Dinner at six');
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a note during the athan waits, and its chime sounds once the athan ends', async ({ page }) => {
  const tones = await countTones(page);
  const { household, errors } = await openWall(page, '2026-10-29T12:35:10', {}, { face: 'family' });
  await expect(face(page).locator('.tk-athan')).toBeVisible();
  // Let the athan start sounding before the note arrives.
  await page.waitForTimeout(1500);
  const before = await tones();
  await postNote(household, 'Back by Asr');
  // The note is on the family face, under the athan; its chime waits.
  await expect(page.locator('.message-layer')).toBeAttached();
  await expect(face(page).locator('.tk-athan')).toBeVisible();
  await page.waitForTimeout(2000);
  expect(await tones()).toBe(before);
  await face(page).getByRole('button', { name: 'Stop the athan' }).click();
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(page.locator('.message-layer')).toContainText('Back by Asr');
  await expect.poll(tones).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

test('a timer started from a phone brings the family face', async ({ browser, page }) => {
  const { household, errors } = await openWall(page, '2026-10-29T14:53:00');
  await expect(face(page).locator('.cl')).toBeVisible();
  // A phone on the same household and the same day as the wall.
  const p = await (await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' })).newPage();
  await p.goto(`/?demo=${household}&layout=phone&now=2026-10-29T14:53:00`);
  await p.locator('.ph-nav').getByRole('button', { name: 'More' }).click();
  await p.locator('.ph-menu button', { hasText: 'Wall timer' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: '5 minutes', exact: true }).click();
  await expect(page.locator('.timer-layer')).toBeVisible();
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('idle, the wall goes back to its resting face, whichever it is', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-29T14:53:00-05:00') });
  const { household, errors } = await openWall(page, '', {}, { face: 'family', wall: { restingFace: 'prayer' } });
  await expect(family(page)).toBeVisible();
  await page.clock.fastForward('03:30');
  await expect(face(page).locator('.cl')).toBeVisible();
  // Used, then left: back to the prayer face.
  await face(page).getByRole('button', { name: 'Family calendar' }).click();
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await page.clock.fastForward('01:00');
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await page.clock.fastForward('03:00');
  await expect(face(page).locator('.cl')).toBeVisible();
  // Resting on the family face, a prayer face left open goes back to it.
  await writeFields(household, 'settings/main', { restingFace: 'family' });
  await page.clock.fastForward('03:30');
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(family(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('asleep, a wall resting on the prayer face shows its night clock; resting on the family face, the sleep screen', async ({
  browser,
  page,
}) => {
  const sleep = { enabled: true, from: '13:00', to: '17:00' };
  // 2:53 PM: the prayer clock's own day theme would be classic, but the wall sleeps.
  const { errors } = await openWall(page, '2026-10-29T14:53:00', {}, { face: 'family', wall: { restingFace: 'prayer', sleep } });
  await expect(face(page).locator('.stage')).toHaveClass(/theme-night/);
  await expect(face(page).locator('.nt')).toBeVisible();
  // A tap on the night clock wakes the wall: the prayer face shows its day.
  await page.mouse.click(800, 250);
  await expect(face(page).locator('.cl')).toBeVisible();
  // The calendar button shows the family face, awake.
  await face(page).getByRole('button', { name: 'Family calendar' }).click();
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(page.locator('.sleep-screen')).toHaveCount(0);
  await expect(rail(page, 'Calendar')).toBeVisible();
  expect(errors).toEqual([]);

  // Another wall on its own household (its own browser: one demo sign-in each).
  const other = await (await browser.newContext()).newPage();
  const second = await openWall(other, '2026-10-29T14:53:00', {}, { face: 'family', wall: { restingFace: 'family', sleep } });
  await expect(other.locator('.sleep-screen')).toBeVisible();
  await expect(other.locator('.prayer-face')).toHaveCount(0);
  expect(second.errors).toEqual([]);
});

test('the athan wakes a sleeping wall, which sleeps again when the sequence ends untouched', async ({ page }) => {
  // A fake clock to run through the sequence: ten seconds before Dhuhr's countdown (12:34); the athan
  // (athan-1, 187 s) and no dua, so it is over by 12:38:10.
  await page.clock.install({ time: new Date('2026-10-29T12:33:50-05:00') });
  const { errors } = await openWall(
    page,
    '',
    { sequence: { preCountdown: true, dua: false, iqamahCountdown: false } },
    { face: 'family', wall: { sleep: { enabled: true, from: '12:00', to: '14:00' } } },
  );
  await expect(page.locator('.sleep-screen')).toBeVisible();
  await page.clock.fastForward('00:15');
  await expect(face(page).locator('.tk-count')).toBeVisible();
  await expect(page.locator('.sleep-screen')).toHaveCount(0);
  await page.clock.fastForward('01:00');
  await expect(face(page).locator('.tk-athan')).toBeVisible();
  await page.clock.fastForward('03:20');
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(page.locator('.sleep-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an athan whose sound is off does not wake a sleeping wall', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-29T12:33:50-05:00') });
  const { errors } = await openWall(
    page,
    '',
    { sounds: { dhuhr: { enabled: false } } },
    { face: 'family', wall: { sleep: { enabled: true, from: '12:00', to: '14:00' } } },
  );
  await expect(page.locator('.sleep-screen')).toBeVisible();
  await page.clock.fastForward('00:15');
  await page.waitForTimeout(500);
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await page.clock.fastForward('01:10');
  await page.waitForTimeout(500);
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(page.locator('.sleep-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('asleep on the prayer face, a silent phase keeps the night clock: no takeover lights the room', async ({ page }) => {
  // 12:49:30 is Dhuhr's iqamah countdown, which never sounds: the wall stays asleep through it.
  const sleep = { enabled: true, from: '12:00', to: '14:00' };
  const { errors } = await openWall(page, '2026-10-29T12:49:30', {}, { face: 'family', wall: { restingFace: 'prayer', sleep } });
  await expect(face(page).locator('.stage')).toHaveClass(/theme-night/);
  await expect(face(page).locator('.nt')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(face(page).locator('.tk')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('falling asleep puts the prayer face settings away', async ({ page }) => {
  const { household, errors } = await openWall(page, '2026-10-29T14:53:00', {}, { wall: { restingFace: 'prayer' } });
  await face(page).getByRole('button', { name: 'Settings' }).click();
  await expect(face(page).locator('.pf-settings')).toBeVisible();
  // A phone's Sleep now (as core/display.ts sendDisplayCommand writes it, on the wall's pinned day).
  const at = new Date('2026-10-29T14:53:00-05:00').getTime();
  await writeFields(household, 'commands/display', { id: 'display', kind: 'sleep', nonce: `n-${Date.now()}`, at });
  await expect(face(page).locator('.stage')).toHaveClass(/theme-night/);
  await expect(face(page).locator('.pf-settings')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a note that came while the wall slept is announced when someone wakes it, not when an athan does', async ({ page }) => {
  const tones = await countTones(page);
  // Ten seconds before Dhuhr's countdown (12:34); the athan (187 s) and no dua or iqamah countdown.
  await page.clock.install({ time: new Date('2026-10-29T12:33:50-05:00') });
  const { household, errors } = await openWall(
    page,
    '',
    { sequence: { preCountdown: true, dua: false, iqamahCountdown: false } },
    { face: 'family', wall: { sleep: { enabled: true, from: '12:00', to: '14:00' } } },
  );
  await expect(page.locator('.sleep-screen')).toBeVisible();
  await postNote(household, 'Lunch is in the fridge');
  await expect(page.locator('.message-layer')).toBeAttached();
  const before = await tones();
  // The athan wakes the wall for its sequence; the note under it stays silent, then and after.
  await page.clock.fastForward('00:15');
  await expect(face(page).locator('.tk-count')).toBeVisible();
  await page.clock.fastForward('04:20');
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(page.locator('.sleep-screen')).toBeVisible();
  await page.clock.runFor(3000);
  expect(await tones()).toBe(before);
  // A tap wakes the wall: the note shows, and is announced.
  await page.locator('.sleep-screen').click();
  await expect(page.locator('.message-layer')).toContainText('Lunch is in the fridge');
  await expect.poll(tones).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

test('the wall moves the old places into the household place once', async ({ page }) => {
  const houston = { name: 'Houston, Texas, United States', latitude: 29.7633, longitude: -95.3633, timezone: 'America/Chicago' };
  const { household, errors } = await openWall(
    page,
    '2026-10-29T14:53:00',
    { place: houston, clock24h: true, weather: { enabled: false, unit: 'c' }, dayTheme: 'kids' },
    { face: 'family', place: null, wall: { weather: { lat: 29.7604, lon: -95.3698, name: 'Houston, Texas' } } },
  );
  await expect
    .poll(async () => (await mainDoc(household)).place)
    .toEqual({ name: 'Houston, Texas, United States', lat: 29.7633, lon: -95.3633, timezone: 'America/Chicago' });
  await expect.poll(async () => Object.keys(await prayerDoc(household)).sort()).toEqual(['dayTheme', 'showWeather']);
  expect(await mainDoc(household)).not.toHaveProperty('weather');
  expect((await prayerDoc(household)).showWeather).toBe(false);
  // The prayer face calculates for it, on the household's 12-hour clock.
  await rail(page, 'Prayer').click();
  await expect(face(page).locator('.kd')).toBeVisible();
  await expect(face(page).locator('.kd-ampm')).toBeVisible();
  expect(errors).toEqual([]);
});
