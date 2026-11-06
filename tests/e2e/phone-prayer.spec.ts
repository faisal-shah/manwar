import { devices, expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { newContext } from './phone-helpers';
import { face, mainDoc, openWall, prayerDoc, trackErrors } from './prayer-helpers';

/*
 * The phone's More > Prayer times and Today's prayer line, against a wall
 * on the same household: the phone edits the household's place and prayer
 * settings, the wall's prayer face follows. Chicago, 29 October 2026 at
 * 2:53 PM: Asr 4:06 PM, iqamah 15 minutes after.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 90_000 });

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

const NOW = '2026-10-29T14:53:00';

/** A phone (signed in as the household's wall, in the phone layout) on the wall's day. */
async function phoneOn(browser: Browser, household: string): Promise<{ page: Page; errors: string[] }> {
  const ctx = await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' });
  await ctx.route('**/geocoding-api.open-meteo.com/**', (r) =>
    r.fulfill({
      json: {
        results: [
          {
            name: 'Austin',
            admin1: 'Texas',
            country: 'United States',
            latitude: 30.2672,
            longitude: -97.7431,
            timezone: 'America/Chicago',
          },
        ],
      },
    }),
  );
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto(`/?demo=${household}&layout=phone&now=${NOW}`);
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  return { page, errors };
}

async function openPrayerTimes(page: Page) {
  await page.locator('.ph-nav').getByRole('button', { name: 'More' }).click();
  if (await page.locator('.ph-back').count()) await page.locator('.ph-back').click();
  await page.locator('.ph-menu button', { hasText: 'Prayer times' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('Prayer times');
  await page.waitForTimeout(500);
}

const row = (page: Page, card: string, label: string) =>
  page.getByRole('region', { name: card }).locator('.setting-row', { hasText: label });

test('with no place yet, the phone sets one and the wall calculates its times', async ({ browser, page }) => {
  const wall = await openWall(page, NOW, {}, { face: 'prayer', place: null });
  await expect(face(page).getByRole('heading', { name: 'Prayer times' })).toBeVisible();
  const p = await phoneOn(browser, wall.household);
  await p.page.locator('.ph-nav').getByRole('button', { name: 'More' }).click();
  await expect(p.page.locator('.ph-menu button', { hasText: 'Prayer times' })).toContainText('Set where the family lives');
  await expect(p.page.locator('.pd-prayer')).toHaveCount(0);
  await openPrayerTimes(p.page);
  await p.page.getByRole('searchbox', { name: 'Search for a place' }).fill('Austin');
  await p.page.locator('.place-results button', { hasText: 'Austin' }).click();
  await expect(p.page.getByRole('region', { name: "Today's prayer times" })).toContainText('Austin, Texas');
  // The household's place (the weather's too), not the prayer clock's own.
  await expect
    .poll(async () => (await mainDoc(wall.household)).place)
    .toEqual({ name: 'Austin, Texas', lat: 30.2672, lon: -97.7431, timezone: 'America/Chicago' });
  expect(await prayerDoc(wall.household)).toEqual({});
  // The wall leaves its setup screen for the clock.
  await expect(face(page).locator('.cl')).toBeVisible();
  expect([...wall.errors, ...p.errors]).toEqual([]);
});

test("an iqamah changed on the phone shows on the wall, and keeps the wall's own change", async ({ browser, page }) => {
  const wall = await openWall(page, NOW);
  const p = await phoneOn(browser, wall.household);
  await openPrayerTimes(p.page);
  const times = p.page.getByRole('region', { name: "Today's prayer times" });
  await expect(times.locator('li.next')).toContainText('Asr');
  await expect(times.locator('li.next')).toContainText('iqamah 4:21 PM');
  // The phone, offline, changes Asr's iqamah from its copy while the wall changes its theme: once the
  // phone's change reaches the server, both are kept (a whole settings write would undo the theme).
  await p.page.context().setOffline(true);
  const asr = row(p.page, 'Iqamah', 'Asr');
  for (let i = 0; i < 5; i++) await asr.getByRole('button', { name: 'Increase' }).click();
  await expect(asr).toContainText('20');
  await expect(times.locator('li.next')).toContainText('iqamah 4:26 PM');
  await face(page).getByRole('button', { name: 'Settings' }).click();
  await face(page).getByRole('button', { name: 'Kids' }).click();
  await face(page).getByRole('button', { name: 'Close settings' }).click();
  await expect.poll(async () => (await prayerDoc(wall.household)).dayTheme).toBe('kids');
  await p.page.context().setOffline(false);
  await expect.poll(async () => ((await prayerDoc(wall.household)).iqamah as Record<string, number> | undefined)?.asr).toBe(20);
  expect((await prayerDoc(wall.household)).dayTheme).toBe('kids');
  await expect(face(page).locator('.kd')).toBeVisible();
  await expect(p.page.locator('.ph-status', { hasText: 'not sent yet' })).toHaveCount(0);
  // Offline, the browser reports each request it could not make.
  expect([...wall.errors, ...p.errors].filter((e) => !/ERR_INTERNET_DISCONNECTED/.test(e))).toEqual([]);
});

test('Today says the next prayer, and a tap opens Prayer times', async ({ browser, page }) => {
  const wall = await openWall(page, NOW);
  const p = await phoneOn(browser, wall.household);
  const line = p.page.locator('.pd-prayer');
  await expect(line).toHaveText('Next: Asr 4:06 PM · iqamah 4:21 PM');
  await line.click();
  await expect(p.page.locator('.ph-head h1')).toHaveText('Prayer times');
  await expect(p.page.getByRole('region', { name: "Today's prayer times" })).toContainText('Chicago');
  expect([...wall.errors, ...p.errors]).toEqual([]);
});

test('a recording uploaded on the wall can be chosen on the phone', async ({ browser, page }) => {
  const wall = await openWall(page, NOW);
  await face(page).getByRole('button', { name: 'Settings' }).click();
  await face(page).locator('.panel-nav').getByRole('button', { name: 'Athan & sound' }).click();
  await face(page).locator('input[type=file][accept="audio/*"]').setInputFiles('public/prayer/audio/chime.mp3');
  await expect(face(page).locator('.pf-row', { hasText: 'chime' })).toBeVisible();
  await expect
    .poll(async () => Object.values((await prayerDoc(wall.household)).recordings ?? {}).map((r) => (r as { name: string }).name))
    .toEqual(['chime']);
  const p = await phoneOn(browser, wall.household);
  await openPrayerTimes(p.page);
  const dhuhr = p.page.getByRole('combobox', { name: 'Dhuhr recording' });
  await expect(dhuhr.locator('option', { hasText: 'Uploaded on the wall: chime' })).toHaveCount(1);
  await dhuhr.selectOption({ label: 'Uploaded on the wall: chime' });
  await expect
    .poll(
      async () => ((await prayerDoc(wall.household)).sounds as Record<string, { audioId: string }> | undefined)?.dhuhr.audioId,
    )
    .toMatch(/^upload:/);
  // The wall plays its own upload for Dhuhr.
  await expect(face(page).locator('.pf-row', { hasText: 'Dhuhr' }).locator('select')).toHaveValue(/^upload:/);
  expect([...wall.errors, ...p.errors]).toEqual([]);
});
