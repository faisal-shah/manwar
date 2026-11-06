import { expect as baseExpect, test, type Page } from '@playwright/test';
import { face, openWall, prayerDoc } from './prayer-helpers';

/*
 * The prayer face on the wall: the prayer clock's themes, its athan
 * sequence and sound, previews, the photo library and its settings (the
 * household's `settings/prayer` document). Chicago, 29 October 2026: Fajr
 * about 6:02, Dhuhr 12:35, Asr 4:06.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 60_000 });

/** What the settings document holds once the change has been written (writes are not awaited). */
const stored = (household: string, key: string) => expect.poll(async () => (await prayerDoc(household))[key]);

/** Record every media element played, from before the page loads. */
async function recordPlays(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __played: HTMLMediaElement[]; __at: number[] };
    w.__played = [];
    w.__at = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      w.__played.push(this);
      w.__at.push(this.currentTime);
      return orig.call(this);
    };
  });
}
const sounding = (page: Page) =>
  page.evaluate(() => (window as unknown as { __played: HTMLMediaElement[] }).__played.some((el) => !el.paused));

async function openSettings(page: Page, section: string) {
  await face(page).getByRole('button', { name: 'Settings' }).click();
  await face(page).locator('.panel-nav').getByRole('button', { name: section }).click();
}

test('with no place yet it asks for one, and the family face is a tap away', async ({ page }) => {
  const { errors } = await openWall(page, '2026-10-29T14:53:00', { place: null });
  await expect(face(page).getByRole('heading', { name: 'Prayer times' })).toBeVisible();
  await expect(face(page).getByRole('button', { name: "Use this tablet's location" })).toBeVisible();
  await face(page).getByRole('button', { name: 'Family calendar' }).click();
  await expect(page.locator('.prayer-face')).toHaveCount(0);
  await expect(page.locator('.shell')).toBeVisible();
  expect(errors).toEqual([]);
});

const scenes: [string, string, Record<string, unknown>, string][] = [
  ['calligraphy after Dhuhr', '2026-10-29T12:50:00', {}, '.ct'],
  ['classic afternoon', '2026-10-29T14:53:00', {}, '.cl'],
  ['kids afternoon', '2026-10-29T14:53:00', { dayTheme: 'kids' }, '.kd'],
  ['night', '2026-10-29T23:10:00', {}, '.nt'],
  ['pre-athan countdown', '2026-10-29T12:34:30', {}, '.tk-count'],
  ['athan', '2026-10-29T12:35:10', {}, '.tk-athan'],
  ['dua', '2026-10-29T12:38:30', {}, '.tk-dua'],
  ['iqamah countdown', '2026-10-29T12:49:30', {}, '.tk-count'],
  ["Jumu'ah", '2026-10-30T12:35:10', {}, '.tk-athan'],
];

for (const [name, now, settings, selector] of scenes) {
  test(`renders ${name} without errors`, async ({ page }) => {
    const { errors } = await openWall(page, now, settings);
    await expect(face(page).locator(selector).first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test('classic theme shows the five prayers with Dhuhr current', async ({ page }) => {
  await openWall(page, '2026-10-29T14:53:00');
  await expect(face(page).locator('.cl-prayer')).toHaveCount(5);
  await expect(face(page).locator('.cl-prayer.current .cl-name')).toHaveText('DHUHR');
  await expect(face(page).locator('.cl-medal-name')).toHaveText('ASR');
});

test('settings open, change the theme, and are the household’s', async ({ page }) => {
  const { household } = await openWall(page, '2026-10-29T14:53:00');
  await face(page).getByRole('button', { name: 'Settings' }).click();
  await face(page).getByRole('button', { name: 'Kids' }).click();
  await face(page).getByRole('button', { name: 'Close settings' }).click();
  await expect(face(page).locator('.kd')).toBeVisible();
  await stored(household, 'dayTheme').toBe('kids');
  // Only what changed was written: the place stays as it was stored.
  expect(((await prayerDoc(household)).place as { name: string }).name).toBe('Chicago, Illinois, United States');
});

test('preview jumps to the athan sequence and exits', async ({ page }) => {
  await openWall(page, '2026-10-29T14:53:00');
  await openSettings(page, 'Preview');
  await face(page).getByRole('button', { name: 'Asr athan' }).click();
  // Previews land 65 s before the athan; the countdown starts at 60 s.
  await expect(face(page).locator('.tk-count')).toBeVisible({ timeout: 10_000 });
  await face(page).locator('.preview-bar').getByRole('button', { name: 'Exit' }).click();
  await expect(face(page).locator('.preview-bar')).toHaveCount(0);
});

test('dismissing the athan returns to the theme', async ({ page }) => {
  await openWall(page, '2026-10-29T12:35:10');
  await face(page)
    .getByRole('button', { name: /Stop the athan|Close/ })
    .click();
  await expect(face(page).locator('.tk-athan')).toHaveCount(0, { timeout: 3000 });
  await expect(face(page).locator('.ct')).toBeVisible();
});

test('plays the Dhuhr athan from the right offset and stops on dismiss', async ({ page }) => {
  await recordPlays(page);
  await openWall(page, '2026-10-29T12:35:20');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __at: number[] }).__at.length)).toBeGreaterThan(0);
  const at = await page.evaluate(() => (window as unknown as { __at: number[] }).__at[0]);
  expect(at).toBeGreaterThan(18);
  expect(at).toBeLessThan(25);
  await expect.poll(() => sounding(page)).toBe(true);
  await face(page).getByRole('button', { name: 'Stop the athan' }).click();
  await expect.poll(() => sounding(page)).toBe(false);
});

test('closing the countdown still brings the athan; settings do not stop it; a reload keeps it stopped', async ({ page }) => {
  await recordPlays(page);
  const { errors } = await openWall(page, '2026-10-29T12:34:52');
  await face(page).locator('.tk-count').getByRole('button', { name: 'Close' }).click();
  await expect(face(page).locator('.tk-count')).toHaveCount(0);
  await expect(face(page).locator('.tk-athan')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => sounding(page)).toBe(true);

  await face(page).getByRole('button', { name: 'Settings' }).click();
  await face(page).getByRole('button', { name: 'Close settings' }).click();
  await page.waitForTimeout(1500);
  expect(await sounding(page)).toBe(true);

  await face(page).getByRole('button', { name: 'Stop the athan' }).click();
  await expect(face(page).locator('.tk-athan')).toHaveCount(0);
  // The page starts again at 12:34:52; the countdown and athan it closed stay closed.
  await page.reload();
  await expect(page.locator('.prayer-face')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(12_000);
  await expect(face(page).locator('.tk')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a preview does not silence the real athan later that day', async ({ page }) => {
  // A fake wall clock: Exit returns to wall time, and the real Asr (16:06) follows the preview.
  await page.clock.install({ time: new Date('2026-10-29T16:03:00-05:00') });
  await recordPlays(page);
  await openWall(page, '');
  await openSettings(page, 'Preview');
  await face(page).getByRole('button', { name: 'Asr athan' }).click();
  await page.clock.runFor(70_000);
  await expect(face(page).locator('.tk-athan')).toBeVisible();
  await expect.poll(() => sounding(page)).toBe(true);
  await face(page).locator('.preview-bar').getByRole('button', { name: 'Exit' }).click();
  await page.clock.runFor(2_000);
  await expect.poll(() => sounding(page)).toBe(false);

  await page.clock.runFor(125_000); // to 16:06:15 on the wall clock
  await expect(face(page).locator('.tk-athan')).toBeVisible();
  await expect.poll(() => sounding(page)).toBe(true);
});

test('Fajr uses the Fajr athan', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => r.url().includes('/prayer/audio/') && urls.push(r.url()));
  await openWall(page, '2026-10-29T06:02:10');
  await expect.poll(() => urls.some((u) => u.endsWith('athan-fajr-1.mp3'))).toBe(true);
});

test('gallery rotates captioned photos by the configured interval', async ({ page }) => {
  const items = ['a', 'b', 'c'].map((id) => ({
    id,
    file: 'kul-sharif.webp',
    fileSm: 'kul-sharif-sm.webp',
    category: 'mosques',
    title: `Title ${id}`,
    subtitle: 'Somewhere',
    fit: 'cover',
    focus: '50% 50%',
    tones: { gallery: 'light', calligraphy: 'dark' },
    credit: {},
  }));
  await page.route('**/prayer/gallery/index.json', (r) => r.fulfill({ json: items }));
  const { errors } = await openWall(page, '2026-10-29T14:53:00', {
    dayTheme: 'gallery',
    gallery: { minutes: 5, categories: { mosques: true, learning: true, treasures: true, landscapes: true, calligraphy: false } },
  });
  await expect(face(page).locator('.gl-title')).toHaveText(/Title [abc]/);
  await expect(face(page).locator('.gl-cat')).toHaveText('Mosques of the World');
  await expect(face(page).locator('.gl-p')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('what the athan sequence used comes from the cache offline: its photo and the recording', async ({ page, context }) => {
  test.setTimeout(90_000);
  await openWall(page, '2026-10-29T12:34:50');
  // The first visit installs the service worker; it controls the page from the next load, which
  // caches what the athan sequence uses as it plays (vite.config.ts). (A real wall also opens
  // offline from Firestore's persistent cache; the demo's cache is in memory.)
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(face(page).locator('.tk-athan')).toBeVisible({ timeout: 30_000 });
  const photo = face(page).locator('.tk-bg img').first();
  await expect(photo).toHaveJSProperty('complete', true);
  const src = (await photo.getAttribute('src'))!;
  expect(src).toMatch(/^\/prayer\/gallery\//);
  await expect.poll(() => page.evaluate(async () => !!(await caches.match('/prayer/audio/athan-1.mp3')))).toBe(true);
  await context.setOffline(true);
  const offline = await page.evaluate(async (photoUrl) => {
    const [a, p] = await Promise.all([fetch('/prayer/audio/athan-1.mp3'), fetch(photoUrl)]);
    return { athan: a.ok && (await a.blob()).size > 100_000, photo: p.ok && (await p.blob()).size > 10_000 };
  }, src);
  expect(offline).toEqual({ athan: true, photo: true });
  // Nothing of the prayer media is in the precache a phone downloads.
  const precached = await page.evaluate(async () => {
    const keys = await Promise.all(
      (await caches.keys()).filter((k) => k.includes('precache')).map(async (k) => (await caches.open(k)).keys()),
    );
    return keys.flat().filter((r) => new URL(r.url).pathname.startsWith('/prayer/')).length;
  });
  expect(precached).toBe(0);
});

test('gallery shows calligraphy pieces with their meaning', async ({ page }) => {
  await page.route('**/prayer/gallery/index.json', (r) => r.fulfill({ json: [] }));
  const { errors } = await openWall(page, '2026-10-29T14:53:00', { dayTheme: 'gallery' });
  await expect(face(page).locator('.gl-cat')).toHaveText('Calligraphy');
  await expect(face(page).locator('.gl-art .callig-art')).toBeVisible();
  await expect(face(page).locator('.gl-sub')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('showcase: browse calligraphy full screen with keys', async ({ page }) => {
  const { errors } = await openWall(page, '2026-10-29T14:53:00');
  await openSettings(page, 'Preview');
  await face(page)
    .locator('.pv-tabs')
    .getByRole('button', { name: /Calligraphy/ })
    .click();
  await face(page).locator('.pv-tile').first().click();
  await expect(face(page).locator('.viewer .gl-art .callig-art')).toBeVisible();
  await expect(face(page).locator('.viewer-count')).toHaveText(/^1 \/ \d+$/);
  await page.keyboard.press('ArrowRight');
  await expect(face(page).locator('.viewer-count')).toHaveText(/^2 \/ \d+$/);
  await page.keyboard.press('Escape');
  await expect(face(page).locator('.viewer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('backgrounds: choose any gallery photo for a prayer', async ({ page }) => {
  const { household, errors } = await openWall(page, '2026-10-29T06:30:00', { dayTheme: 'calligraphy' });
  await openSettings(page, 'Backgrounds');
  // A background opens at its own part of the day: Isha's at 7:16 PM, ten minutes after the athan.
  await face(page).locator('.bg-slot').nth(5).locator('.bg-thumb').first().click();
  await expect(face(page).locator('.viewer .ct-headline .big')).toHaveText('ISHA');
  await expect(face(page).locator('.viewer .ct-clock')).toHaveText(/^7:16/);
  await page.keyboard.press('Escape');
  const fajr = face(page).locator('.bg-slot').first();
  await expect(fajr.locator('.bg-slot-count')).toHaveText('2 photos · suggested');
  await fajr.getByRole('button', { name: 'Choose photos' }).click();

  const picker = face(page).getByRole('dialog', { name: 'Fajr backgrounds' });
  await picker.getByRole('button', { name: 'Sheikh Lotfollah Mosque', exact: true }).click();
  await picker.getByRole('button', { name: 'Ortaköy Mosque', exact: true }).click();
  await picker.getByRole('button', { name: 'Lakeside Mosque', exact: true }).click();
  await stored(household, 'backgrounds').toMatchObject({ fajr: ['sheikh-lotfollah'] });

  // Preview it full screen as the calligraphy theme lays it out.
  await picker.getByRole('button', { name: 'Preview Sheikh Lotfollah Mosque' }).click();
  await expect(face(page).locator('.viewer .ct .ph-cover')).toHaveAttribute('src', '/prayer/gallery/sheikh-lotfollah.webp');
  await expect(face(page).locator('.viewer-use')).toHaveText('In the Fajr set · remove');
  await page.keyboard.press('Escape');
  await picker.getByRole('button', { name: 'Done' }).click();
  await face(page).getByRole('button', { name: 'Close settings' }).click();
  // The new photo crossfades in over the old one.
  await expect(face(page).locator('.ct .ct-photo .ph-cover').last()).toHaveAttribute(
    'src',
    '/prayer/gallery/sheikh-lotfollah.webp',
  );

  await openSettings(page, 'Backgrounds');
  await face(page).locator('.bg-slot').first().getByRole('button', { name: 'Choose photos' }).click();
  await picker.getByRole('button', { name: 'Use the suggested' }).click();
  await stored(household, 'backgrounds').toMatchObject({ fajr: null });
  expect(errors).toEqual([]);
});

test('gallery: upload a photo, make it a background, delete it', async ({ page }) => {
  const { household, errors } = await openWall(page, '2026-10-29T14:53:00');
  await openSettings(page, 'Preview');
  await face(page)
    .locator('.pv-tabs')
    .getByRole('button', { name: /Gallery/ })
    .click();
  await face(page).locator('.up-tile input').setInputFiles('public/prayer/gallery/kul-sharif.webp');
  const tile = face(page)
    .locator('.pv-group', { has: page.locator('.up-tile') })
    .locator('.pv-cell');
  await expect(tile).toBeVisible();

  await tile.locator('.pv-tile').click();
  await expect(face(page).locator('.viewer .gl-title')).toHaveText('kul sharif');
  await expect(face(page).locator('.viewer .gl-cat')).toHaveText('Your Photos');
  await face(page).locator('.viewer-slots').getByRole('button', { name: 'Isha' }).click();
  await expect(face(page).locator('.viewer-slots').getByRole('button', { name: 'Isha' })).toHaveAttribute('aria-pressed', 'true');
  const isha = async () => ((await prayerDoc(household)).backgrounds as Record<string, string[]>).isha;
  await expect.poll(async () => (await isha())?.length).toBe(3);
  expect((await isha()).filter((id) => id.startsWith('upload:'))).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(tile.locator('.pv-note')).toHaveText('Isha');

  page.once('dialog', (d) => d.accept());
  await tile.getByRole('button', { name: 'Delete kul sharif' }).click();
  await expect(tile).toHaveCount(0);
  await expect.poll(async () => [...(await isha())].sort()).toEqual(['shah-alam', 'suleymaniye']);
  expect(errors).toEqual([]);
});

test('backgrounds: select every photo, or a whole group', async ({ page }) => {
  const { household, errors } = await openWall(page, '2026-10-29T06:30:00', { dayTheme: 'calligraphy' });
  const fajrChoice = async () => ((await prayerDoc(household)).backgrounds as Record<string, unknown> | undefined)?.fajr;
  await openSettings(page, 'Backgrounds');
  await face(page).locator('.bg-slot').first().getByRole('button', { name: 'Choose photos' }).click();
  const picker = face(page).getByRole('dialog', { name: 'Fajr backgrounds' });
  const selectAll = picker.getByRole('button', { name: 'Select all', exact: true });

  const total = await picker.locator('.pk-tile').count();
  await selectAll.click();
  await expect.poll(fajrChoice).toBe('all');
  await expect(picker.locator('.pk-tile.on')).toHaveCount(total);
  await expect(selectAll).toHaveCount(0);
  await expect(picker.locator('.picker-head p')).toHaveText(
    `All ${total} photos, a different one each day, and any you add later`,
  );

  // A photo added later joins the rotation.
  await picker.locator('.up-tile input').setInputFiles('public/prayer/gallery/kul-sharif.webp');
  await expect(picker.locator('.pk-tile.on')).toHaveCount(total + 1);
  expect(await fajrChoice()).toBe('all');

  // Deselect one group, then select it again.
  const treasures = picker.locator('.pk-group', { hasText: 'Treasures of Islamic Civilization' });
  const inTreasures = await treasures.locator('.pk-tile').count();
  await picker.getByRole('button', { name: 'Deselect all: Treasures of Islamic Civilization' }).click();
  await expect(treasures.locator('.pk-tile.on')).toHaveCount(0);
  await expect.poll(async () => ((await fajrChoice()) as string[]).length).toBe(total + 1 - inTreasures);
  await expect(selectAll).toBeVisible();
  await picker.getByRole('button', { name: 'Select all: Treasures of Islamic Civilization' }).click();
  await expect.poll(fajrChoice).toBe('all');

  // Deselect everything, then choose just one: until then the suggested photos show.
  await picker.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await expect.poll(fajrChoice).toEqual([]);
  await expect(picker.locator('.pk-tile.on')).toHaveCount(0);
  await expect(picker.locator('.picker-head p')).toHaveText('None chosen, so the suggested photos show');
  await expect(picker.getByRole('button', { name: 'Deselect all', exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Done' }).click();
  await expect(face(page).locator('.bg-slot').first().locator('.bg-slot-count')).toHaveText('2 photos · suggested');
  await face(page).locator('.bg-slot').first().getByRole('button', { name: 'Choose photos' }).click();
  await picker.getByRole('button', { name: 'Taksim Mosque', exact: true }).click();
  await expect.poll(fajrChoice).toEqual(['taksim']);
  await picker.getByRole('button', { name: 'Select all', exact: true }).click();

  await picker.getByRole('button', { name: 'Done' }).click();
  const fajr = face(page).locator('.bg-slot').first();
  await expect(fajr.locator('.bg-slot-count')).toHaveText(`All ${total + 1} photos`);
  await expect(fajr.locator('.bg-thumb')).toHaveCount(total + 1);
  await expect(fajr.locator('.bg-thumb').first().locator('.bg-today')).toHaveText('Today');
  expect(errors).toEqual([]);
});

test('display: a new daytime theme shows at once, even in the calligraphy window', async ({ page }) => {
  // 25 minutes after the Dhuhr athan (12:35), inside its 45-minute calligraphy window. A fake
  // wall clock rather than ?now=, because exiting the preview returns to wall time.
  await page.clock.install({ time: new Date('2026-10-29T13:00:00-05:00') });
  const { errors } = await openWall(page, '');
  await expect(face(page).locator('.stage')).toHaveClass(/theme-calligraphy/);
  await openSettings(page, 'Display');
  const row = face(page).locator('.pf-row', { hasText: 'Daytime theme' });
  await expect(row.locator('.row-hint')).toContainText('Calligraphy is on after the Dhuhr athan until 1:20');
  await row.getByRole('button', { name: 'Kids' }).click();
  await expect(row.locator('.row-hint')).toHaveText('Shown outside the calligraphy window and the night hours.');
  await face(page).getByRole('button', { name: 'Close settings' }).click();
  await expect(face(page).locator('.stage')).toHaveClass(/theme-kids/);

  // A preview runs and ends without bringing the window back.
  await openSettings(page, 'Preview');
  await face(page)
    .getByRole('button', { name: /Ramadan · before iftar/ })
    .click();
  await expect(face(page).locator('.preview-bar')).toBeVisible();
  await face(page).locator('.preview-bar').getByRole('button', { name: 'Exit' }).click();
  await expect(face(page).locator('.preview-bar')).toHaveCount(0);
  await expect(face(page).locator('.stage')).toHaveClass(/theme-kids/);
  expect(errors).toEqual([]);
});

test('moments: Ramadan before iftar lands on a real Ramadan date', async ({ page }) => {
  await openWall(page, '2026-10-29T14:53:00');
  await openSettings(page, 'Preview');
  await face(page)
    .getByRole('button', { name: /Ramadan · before iftar/ })
    .click();
  await expect(face(page).locator('.cl-medal-name')).toHaveText('IFTAR');
  await expect(face(page).locator('.cl-date')).toContainText('RAMADAN');
  await expect(face(page).locator('.greeting-en')).toHaveText('Ramadan Kareem');
});
