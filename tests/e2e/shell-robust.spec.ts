import { expect, test, type Page } from '@playwright/test';

/*
 * The wall left running for weeks: first run, offline boots, idle return,
 * sleep, and Google connection problems.
 */

const NOW = 'now=2026-11-04T11:44';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents';
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

/**
 * The app's own session module, for tests that drive it (dev server only).
 * After an edit Vite serves modules with a ?t= stamp, so the URL comes from
 * the page's requests; call before the page loads.
 */
function sessionModule(page: Page): () => string {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return () => {
    const url = urls.find((u) => new URL(u).pathname === '/src/data/session.ts');
    // A production build bundles the module: nothing to drive.
    test.skip(!url, 'drives the session module, which only the dev server serves');
    return url!;
  };
}

/** Ask the token Function for a Calendar token; the demo household has no Google connection, so it refuses. */
const requestToken = (page: Page, url: string) =>
  page.evaluate(async (u) => {
    const s = await import(/* @vite-ignore */ u);
    return s.googleAccessToken().then(
      () => 'no error',
      (e: Error) => e.message,
    );
  }, url);

async function openSettings(page: Page, section: string) {
  await rail(page, 'Settings').click();
  await page.locator('.set-menu button', { hasText: new RegExp(`^${section}$`) }).click();
}

/**
 * Settings > Display > Return to Home after 1 minute. Waits for the demo seed
 * and the write to settle first: a fake-clock jump while they are in flight
 * can show the settings document without the change for a moment.
 */
async function setIdleReturn(page: Page) {
  await expect(page.locator('.rail .badge')).toHaveText('3', { timeout: 15_000 });
  await openSettings(page, 'Display');
  const one = page.getByRole('tab', { name: '1 min' });
  await one.click();
  await expect(one).toHaveAttribute('aria-selected', 'true');
  await page.waitForTimeout(1000);
}

test('a first-run household shows how to add people, and the button opens Profiles', async ({ page }) => {
  await open(page, '&seed=none');
  await rail(page, 'Tasks').click();
  const prompt = page.locator('.no-profiles');
  await expect(prompt).toContainText('Add your family in Settings, under Profiles.');
  await expect(page.getByText('Every profile is hidden')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Week' }).click();
  await expect(prompt).toBeVisible();
  await rail(page, 'Rewards').click();
  await expect(prompt).toBeVisible();
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

test('a first run that cannot reach the database yet seeds once it can', async ({ page }) => {
  test.setTimeout(90_000);
  // Firestore (the emulator on :8080) is unreachable at first: the app opens from an empty cache.
  const firestore = /^https?:\/\/[^/]+:8080\//;
  await page.route(firestore, (r) => r.abort('internetdisconnected'));
  await open(page, '&seed=none');
  await rail(page, 'Home').click();
  await expect(page.locator('.home-lists')).toContainText('No lists yet.');
  await page.unroute(firestore);
  await expect(page.locator('.home-lists')).toContainText('Grocery List', { timeout: 60_000 });
});

/** Expire the stored ID token, so reading the claims has to refresh it. */
async function expireSignIn(page: Page): Promise<void> {
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
}

const TOKEN_REFRESH = '**/securetoken.googleapis.com/**';

test('a tablet that boots offline with an expired sign-in still opens its household', async ({ page }) => {
  await open(page);
  await expireSignIn(page);
  // The Wi-Fi is not up yet: the token refresh fails.
  await page.route(TOKEN_REFRESH, (r) => r.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.connect')).toHaveCount(0);
});

test('with no household remembered, an offline boot waits and opens once the network is back', async ({ page }) => {
  // Unrouting fires no `online` event, so this waits out the 15 s retry; leave room under a loaded parallel run.
  test.setTimeout(75_000);
  await open(page);
  await expireSignIn(page);
  await page.evaluate(() => localStorage.removeItem('manwar.claims.v1'));
  await page.route(TOKEN_REFRESH, (r) => r.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('.connect')).toContainText('Waiting for the network to open the household', {
    timeout: 15_000,
  });
  await page.unroute(TOKEN_REFRESH);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 25_000 });
});

test('typing counts as activity: idle return does not pull the wall away from an editor', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await setIdleReturn(page);
  await page.getByRole('button', { name: 'Close' }).click();

  await rail(page, 'Recipes').click();
  await page.locator('.fab').click();
  const steps = page.getByPlaceholder('One step per line, or a paragraph');
  await steps.click();
  // Two minutes of typing on the keyboard, no taps.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.type('Stir. ');
    await page.clock.runFor('00:30');
  }
  await expect(rail(page, 'Recipes')).toHaveClass(/on/);
  await expect(steps).toHaveValue('Stir. Stir. Stir. Stir. ');

  // Left alone, the wall goes Home.
  await page.clock.runFor('01:20');
  await expect(rail(page, 'Home')).toHaveClass(/on/);
});

test('idle return closes a Settings sheet left open', async ({ page }) => {
  await page.clock.install();
  await open(page);
  await setIdleReturn(page);
  await page.clock.runFor('01:20');
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

/** Two taps on one spot, as a finger does it (about 150 ms apart). */
async function doubleTapAt(page: Page, x: number, y: number) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
  await page.mouse.click(x, y);
}

test('a double tap on Sleep now sleeps, and a double tap that wakes the wall acts on nothing under it', async ({ page }) => {
  await open(page);
  await rail(page, 'Home').click();
  const circle = page.locator('[data-column="asiyah"] .tk-card').first();
  await expect(circle).toBeVisible({ timeout: 15_000 });
  await rail(page, 'Sleep').click();
  const sleepNowBox = (await page.getByRole('button', { name: 'Enter sleep mode now' }).boundingBox())!;
  await doubleTapAt(page, sleepNowBox.x + sleepNowBox.width / 2, sleepNowBox.y + sleepNowBox.height / 2);
  const sleepScreen = page.locator('.sleep-screen');
  await page.waitForTimeout(300);
  await expect(sleepScreen).toBeVisible();

  // Wake it with a double tap right over a task's check circle.
  const check = (await circle.locator('.tk-check').boundingBox())!;
  await doubleTapAt(page, check.x + check.width / 2, check.y + check.height / 2);
  await expect(sleepScreen).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(circle).not.toHaveClass(/done/);
  // Once awake, a tap works as usual.
  await circle.locator('.tk-check').click();
  await expect(circle).toHaveClass(/done/);
});

test('a reload inside the sleep window (an update at night) keeps the backlight off', async ({ page }) => {
  // Fully Kiosk's brightness call, recorded.
  await page.addInitScript(() => {
    const w = window as unknown as { __brightness: number[]; fully: object };
    w.__brightness = [];
    w.fully = { setScreenBrightness: (v: number) => w.__brightness.push(v), turnScreenOn: () => {} };
  });
  const name = await open(page);
  await rail(page, 'Sleep').click();
  await page.locator('.modal .set-switch').click();
  await page.getByRole('textbox', { name: 'From' }).fill('11:00');
  await page.getByRole('textbox', { name: 'To' }).fill('13:00');
  await page.getByRole('button', { name: 'Save' }).click();
  // The demo cache is in memory: the reload reads the window from the emulator.
  await expect
    .poll(async () => {
      const res = await fetch(`${FS}/households/demo-${name}/settings/main`, { headers: { Authorization: 'Bearer owner' } });
      const body = (await res.json()) as { fields?: { sleep?: { mapValue: { fields: { enabled?: { booleanValue: boolean } } } } } };
      return body.fields?.sleep?.mapValue.fields.enabled?.booleanValue ?? false;
    })
    .toBe(true);

  await page.reload();
  await expect(page.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.sleep-screen')).toBeVisible();
  const levels = await page.evaluate(() => (window as unknown as { __brightness: number[] }).__brightness);
  expect(levels).toEqual([0]);
});

test('a Google connection that needs a reconnect shows on the wall and leads to Settings', async ({ page }) => {
  const session = sessionModule(page);
  await open(page);
  await expect(page.locator('.sync-status')).toHaveCount(0);
  const message = await requestToken(page, session());
  expect(message).toBe('Google is not connected. Connect the Google account again.');
  const chip = page.locator('.sync-status.bad');
  await expect(chip).toHaveText('Reconnect Google Calendar');
  await chip.click();
  await expect(page.locator('.set-menu button.on')).toHaveText('Google Calendar');
  await expect(page.locator('.set-page')).toContainText('Google is not connected. Connect the Google account again.');
  await expect(page.locator('.set-page').getByRole('button', { name: 'Reconnect' })).toBeVisible();
});

test('a message posted while the wall sleeps chimes only once someone wakes it', async ({ page, browser }) => {
  // Count synthesized tones (every chime starts oscillators).
  await page.addInitScript(() => {
    const w = window as unknown as { __tones: number };
    w.__tones = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      w.__tones++;
      return create.call(this);
    };
  });
  const tones = () => page.evaluate(() => (window as unknown as { __tones: number }).__tones);
  const name = await open(page);
  await rail(page, 'Sleep').click();
  await page.getByRole('button', { name: 'Enter sleep mode now' }).click();
  await expect(page.locator('.sleep-screen')).toBeVisible();

  // Another tablet in the household posts a note.
  const other = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await other.goto(`/?demo=${name}&${NOW}`);
  await expect(other.locator('.shell')).toBeVisible({ timeout: 20_000 });
  await other.locator('.rail button', { hasText: 'Home' }).click();
  await other.getByRole('button', { name: 'Message' }).click();
  await other.getByRole('textbox', { name: 'Message' }).fill('Lights out!');
  await other.getByRole('button', { name: 'Post to the wall' }).click();
  await expect(page.getByRole('dialog', { name: 'Message' })).toBeAttached();
  await page.waitForTimeout(500);
  expect(await tones()).toBe(0);
  await other.close();

  await page.locator('.sleep-screen').click();
  await expect(page.getByRole('dialog', { name: 'Message' })).toContainText('Lights out!');
  await expect.poll(tones).toBeGreaterThan(0);
});

test('a sleep or night window with the same From and To says it never turns on', async ({ page }) => {
  await open(page);
  await rail(page, 'Sleep').click();
  await page.locator('.modal .set-switch').click();
  await page.getByRole('textbox', { name: 'From' }).fill('22:00');
  await page.getByRole('textbox', { name: 'To' }).fill('22:00');
  await expect(page.locator('.modal [role=alert]')).toHaveText('From and To are the same time, so this never turns on.');
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'To' }).fill('06:00');
  await expect(page.locator('.modal [role=alert]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  await page.locator('.scrim.top').click({ position: { x: 5, y: 5 } });

  await openSettings(page, 'Display');
  await page.getByRole('switch', { name: 'Dark theme at night' }).click();
  await page.getByRole('textbox', { name: 'To' }).fill('20:30');
  await expect(page.locator('.set-page [role=alert]')).toBeVisible();
});

test('Reconnect asks for the PIN once the lock has relocked behind an open Settings', async ({ page }) => {
  const session = sessionModule(page);
  await page.clock.install();
  await open(page);
  const key = (d: string) => page.locator('.pin-setup .pin-keys button', { hasText: new RegExp(`^${d}$`) });
  await openSettings(page, 'Parental lock');
  await page.getByRole('button', { name: /Set a PIN/ }).click();
  for (const d of '1357') await key(d).click();
  await expect(page.locator('.pin-setup')).toContainText('Enter the PIN again');
  for (const d of '1357') await key(d).click();
  await expect(page.getByText('The lock is on')).toBeVisible();
  await requestToken(page, session());
  await page.locator('.set-menu button', { hasText: /^Google Calendar$/ }).click();
  // Nobody touches the wall; the lock relocks with Settings still open.
  await page.clock.fastForward('02:10');
  await page.locator('.set-page').getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.locator('.modal', { hasText: 'Parent PIN' })).toContainText('Enter the PIN to reconnect Google.');
});

test("a failed place search shows only the failure, not the last query's places", async ({ page }) => {
  let up = true;
  await page.route('**/geocoding-api.open-meteo.com/**', (r) =>
    up
      ? r.fulfill({
          json: {
            results: [{ name: 'Springfield', admin1: 'Illinois', country: 'United States', latitude: 39.8, longitude: -89.6 }],
          },
        })
      : r.abort('internetdisconnected'),
  );
  await open(page);
  await openSettings(page, 'Weather');
  const search = page.getByRole('searchbox', { name: 'Search for a place' });
  await search.fill('Springfield');
  await expect(page.getByRole('button', { name: /Springfield/ })).toBeVisible();
  up = false;
  await search.fill('Springfielt');
  await expect(page.getByText('The place search is not reachable.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Springfield/ })).toHaveCount(0);
  await expect(page.getByText('No places found.')).toHaveCount(0);
});

test('a second profile with the same name is refused; renaming one to its own name is fine', async ({ page }) => {
  await open(page);
  await openSettings(page, 'Profiles');
  await page.getByRole('button', { name: 'Add a profile' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(' mamma ');
  await expect(page.getByRole('alert')).toHaveText('Another profile is already called mamma.');
  await expect(page.getByRole('button', { name: 'Create profile' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Name' }).fill('Maryam');
  await expect(page.getByRole('button', { name: 'Create profile' })).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Edit Mamma' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

test('the screen wake lock is taken again when the system drops it', async ({ page }) => {
  // A stand-in wake lock whose sentinel the test can release, as battery saver would.
  await page.addInitScript(() => {
    const w = window as unknown as { __locks: EventTarget[] };
    w.__locks = [];
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: () => {
          const s = new EventTarget();
          w.__locks.push(s);
          return Promise.resolve(s);
        },
      },
    });
  });
  await page.clock.install();
  await open(page);
  const locks = () => page.evaluate(() => (window as unknown as { __locks: EventTarget[] }).__locks.length);
  expect(await locks()).toBe(1);
  await page.evaluate(() => {
    const w = window as unknown as { __locks: EventTarget[] };
    w.__locks[0].dispatchEvent(new Event('release'));
  });
  await page.clock.runFor('00:06');
  await expect.poll(locks).toBe(2);
});

test('a wake lock the browser keeps refusing is asked for once a minute, however often the page shows', async ({ page }) => {
  // A browser that refuses the lock (a WebView without the permission).
  await page.addInitScript(() => {
    const w = window as unknown as { __asks: number };
    w.__asks = 0;
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: () => {
          w.__asks++;
          return Promise.reject(new DOMException('refused', 'NotAllowedError'));
        },
      },
    });
  });
  await page.clock.install();
  await open(page);
  const asks = () => page.evaluate(() => (window as unknown as { __asks: number }).__asks);
  expect(await asks()).toBe(1);
  // The screen goes off and on again and again over the weeks (each time the page shows).
  for (let i = 0; i < 5; i++) await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.clock.runFor('01:00');
  const afterAMinute = await asks();
  await page.clock.runFor('05:00');
  // Five more minutes: five more asks, not five per retry chain.
  expect((await asks()) - afterAMinute).toBeLessThanOrEqual(5);
});

test('five wrong PINs pause the pad; the right PIN works after the pause', async ({ page }) => {
  await page.clock.install();
  await open(page);
  const key = (scope: ReturnType<Page['locator']>, d: string) =>
    scope.locator('.pin-keys button', { hasText: new RegExp(`^${d}$`) });
  await openSettings(page, 'Parental lock');
  await page.getByRole('button', { name: /Set a PIN/ }).click();
  const setup = page.locator('.pin-setup');
  for (const d of '2468') await key(setup, d).click();
  await expect(setup).toContainText('Enter the PIN again');
  for (const d of '2468') await key(setup, d).click();
  await page.getByRole('button', { name: 'Lock now' }).click();

  await rail(page, 'Settings').click();
  const pad = page.locator('.modal', { hasText: 'Parent PIN' });
  for (let i = 0; i < 5; i++) for (const d of '1111') await key(pad, d).click();
  await expect(pad).toContainText('Too many wrong PINs. Try again in 30 s.');
  await expect(key(pad, '2')).toBeDisabled();
  await page.clock.fastForward('00:31');
  await expect(key(pad, '2')).toBeEnabled();
  for (const d of '2468') await key(pad, d).click();
  await expect(pad).toHaveCount(0);
  await expect(page.locator('.sheet')).toBeVisible();
});

test('weather is fetched once per place, not on every settings change, and hides when stale', async ({ page }) => {
  await page.clock.install();
  let fetches = 0;
  let up = true;
  await page.route('**/api.open-meteo.com/**', (r) => {
    fetches++;
    if (!up) return r.abort('internetdisconnected');
    return r.fulfill({
      json: {
        current: { temperature_2m: 21, weather_code: 0, is_day: 1 },
        daily: { time: ['2026-11-04'], weather_code: [0], temperature_2m_max: [24], temperature_2m_min: [12] },
      },
    });
  });
  await open(page);
  await expect(page.locator('.topbar .wx')).toContainText('70°');
  const before = fetches;
  await openSettings(page, 'Display');
  await page.getByRole('switch', { name: /^Sounds/ }).click();
  await page.getByRole('switch', { name: /^Sounds/ }).click();
  await page.getByRole('tab', { name: 'Large' }).click();
  await page.getByRole('tab', { name: 'Medium' }).click();
  await page.waitForTimeout(500);
  expect(fetches).toBe(before);

  // The Wi-Fi drops for hours: the last reading stops showing as current.
  up = false;
  await page.getByRole('button', { name: 'Close' }).click();
  await page.clock.fastForward('02:00:00');
  await expect(page.locator('.topbar .wx')).toBeVisible();
  await page.clock.fastForward('01:30:00');
  await expect(page.locator('.topbar .wx')).toHaveCount(0);
  up = true;
  await page.clock.fastForward('00:30:00');
  await expect(page.locator('.topbar .wx')).toBeVisible();
});
