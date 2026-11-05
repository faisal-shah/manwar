import { expect as baseExpect, test } from '@playwright/test';
import { devices, type Browser } from '@playwright/test';
import { enterPin, setPin } from './phone-family';
import { FS, newContext, NOW, OWNER, pairingCode, pairPhone, phone, redeem, wall } from './phone-helpers';

/** A phone on the pairing screen with nothing filled in (`pair=` empty, as a person typing the code sees it). */
async function redeemLater(browser: Browser, household: string) {
  const page = await (await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' })).newPage();
  await page.goto(`/?demo=${household}&pair=&${NOW}`);
  return { page };
}

/*
 * Pairing a parent's phone with the wall, and what removing it does. Runs
 * the real pairing Functions on the emulator: the wall makes a code, a
 * phone redeems it once for its own sign-in, the wall removes it again.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });
const RUN = Date.now().toString(36);

// Every wall and phone a test opened is its own browser context: close them, or a worker holds them all.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map((c) => c.close()));
});

test('a phone pairs from the wall, opens its own layout, and stays paired after a reload', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-ok`;
  const w = await wall(browser, household);
  const p = await pairPhone(browser, w.page, household);
  // The wall lists it at once and puts the code away.
  await expect(w.page.locator('.set-row', { hasText: "Mamma's phone" })).toBeVisible();
  await expect(w.page.locator('.pair-card')).toHaveCount(0);
  // The pairing link is used up: the address no longer carries the code.
  expect(new URL(p.page.url()).searchParams.get('pair')).toBeNull();
  await p.page.reload();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await p.page.getByRole('button', { name: 'More' }).click();
  await p.page.getByRole('button', { name: 'This phone' }).click();
  await expect(p.page.locator('.ph-body')).toContainText("Paired as Mamma's phone");
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('a code works once; a second phone with it is told to make a new one', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-once`;
  const w = await wall(browser, household);
  const code = await pairingCode(w.page);
  const first = await redeem(browser, household, code, 'First');
  await expect(first.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  const second = await redeem(browser, household, code, 'Second');
  await expect(second.page.locator('.ph-pair .error')).toContainText('expired or was already used');
  await expect(second.page.locator('.ph-nav')).toHaveCount(0);
});

test('a typed code pairs too, and an expired one does not', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-typed`;
  const w = await wall(browser, household);
  const code = await pairingCode(w.page);
  const p = await redeemLater(browser, household);
  // `pair=` empty: the pairing screen, nothing filled in.
  await expect(p.page.getByLabel('Pairing code')).toHaveValue('');
  await p.page.getByLabel('Pairing code').fill(code.toLowerCase());
  await expect(p.page.getByLabel('Pairing code')).toHaveValue(`${code.slice(0, 4)}-${code.slice(4)}`);
  await p.page.getByLabel('Name for this phone').fill('Baba');
  await p.page.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });

  // A code past its ten minutes (written straight to the emulator) is refused.
  const stale = 'ZZZZ2222';
  const res = await fetch(`${FS}/pairings/${stale}`, {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        hid: { stringValue: `demo-${household}` },
        account: { stringValue: 'demo@manwar.local' },
        expiresAt: { integerValue: String(Date.now() - 1000) },
      },
    }),
  });
  expect(res.status).toBe(200);
  const late = await redeem(browser, household, stale, 'Late');
  await expect(late.page.locator('.ph-pair .error')).toContainText('expired or was already used');
});

test('the wall removes a phone: it is signed out and told why', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-remove`;
  const w = await wall(browser, household);
  const p = await pairPhone(browser, w.page, household, 'Old phone');
  const row = w.page.locator('.set-row', { hasText: 'Old phone' });
  await row.getByRole('button', { name: 'Remove' }).click();
  await w.page.getByRole('dialog', { name: 'Remove Old phone?' }).getByRole('button', { name: 'Remove' }).click();
  await expect(row).toHaveCount(0);
  await expect(p.page.locator('.ph-pair')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('.ph-pair .error')).toContainText('This phone was removed from the household');
  // A reload does not bring it back.
  await p.page.reload();
  await expect(p.page.locator('.ph-pair')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('.ph-nav')).toHaveCount(0);
});

test('a phone unpairs itself without being told it was removed', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-unpair`;
  const w = await wall(browser, household);
  const p = await pairPhone(browser, w.page, household, 'Spare');
  await p.page.getByRole('button', { name: 'More' }).click();
  await p.page.getByRole('button', { name: 'This phone' }).click();
  await p.page.getByRole('button', { name: 'Unpair this phone' }).click();
  await p.page.getByRole('dialog').getByRole('button', { name: 'Unpair' }).click();
  await expect(p.page.locator('.ph-pair')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('.ph-pair .error')).toHaveCount(0);
  await expect(w.page.locator('.set-row', { hasText: 'Spare' })).toHaveCount(0);
  // Where it was (More > This phone) went with the household: paired again in the same tab, it opens on Today.
  // The wall put the last code away when the phone joined.
  await expect(w.page.locator('.pair-card')).toHaveCount(0);
  await w.page.getByRole('button', { name: 'Add a phone' }).click();
  const code = w.page.locator('.pair-code');
  await expect(code).toHaveText(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/, { timeout: 20_000 });
  await p.page.getByLabel('Pairing code').fill((await code.textContent())!);
  await p.page.getByLabel('Name for this phone').fill('Spare');
  await p.page.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('.ph-head h1')).toHaveText('Today');
});

test("the phone's Back closes what is open, then returns to Today", async ({ browser }) => {
  const p = await phone(browser, `e2e-pair-${RUN}-back`);
  const page = p.page;
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'This phone' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('This phone');
  await page.getByRole('button', { name: 'Use the wall layout here' }).waitFor();
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('More');
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  // The header's back arrow gives the entry back: Back after it does not undo it.
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'This phone' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.ph-head h1')).toHaveText('More');
  // Playwright's goBack targets an entry, not "one back": let the page's own history.back() land first.
  await expect.poll(() => page.evaluate(() => (history.state as { manwarBack?: number } | null)?.manwarBack)).toBe(1);
  await page.goBack();
  await expect(page.locator('.ph-head h1')).toHaveText('Today');
  expect(p.errors).toEqual([]);
});

test('Done puts the code away: a phone using it after that is told to make a new one', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-done`;
  const w = await wall(browser, household);
  const code = await pairingCode(w.page);
  await w.page.locator('.pair-card').getByRole('button', { name: 'Done' }).click();
  await expect(w.page.locator('.pair-card')).toHaveCount(0);
  // The code leaves the server (cancelPairing) as the card goes.
  await expect.poll(async () => (await fetch(`${FS}/pairings/${code}`, { headers: OWNER })).status).toBe(404);
  const late = await redeem(browser, household, code, 'Late');
  await expect(late.page.locator('.ph-pair .error')).toContainText('expired or was already used');
  await expect(late.page.locator('.ph-nav')).toHaveCount(0);
  expect(w.errors).toEqual([]);
});

test('with a PIN set, each new code asks for it, even while the wall is unlocked', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-pin`;
  const w = await wall(browser, household);
  await setPin(household);
  await w.page.locator('.rail button', { hasText: 'Settings' }).click();
  await enterPin(w.page);
  await w.page.getByRole('button', { name: 'Phones' }).click();
  // Unlocked a moment ago, and still it asks: a phone paired here never will.
  await w.page.waitForTimeout(500);
  await w.page.getByRole('button', { name: 'Add a phone' }).click();
  await enterPin(w.page);
  await expect(w.page.locator('.pair-code')).toHaveText(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/, { timeout: 20_000 });
  expect(w.errors).toEqual([]);
});

test('a paired device switched to the wall layout is a wall: it asks for the PIN, and About switches it back', async ({
  browser,
}) => {
  const household = `e2e-pair-${RUN}-walllayout`;
  const w = await wall(browser, household);
  const p = await pairPhone(browser, w.page, household, 'Kids tablet');
  await setPin(household);
  await p.page.getByRole('button', { name: 'More' }).click();
  await p.page.getByRole('button', { name: 'This phone' }).click();
  await p.page.waitForTimeout(500);
  // It asks first, saying what changes; Cancel keeps the phone.
  const useWall = p.page.getByRole('button', { name: 'Use the wall layout here' });
  await useWall.click();
  const ask = p.page.getByRole('dialog', { name: 'Use the wall layout here?' });
  await expect(ask).toContainText('It asks for the parent PIN before changes, as the wall does.');
  await expect(ask).toContainText("Its screen dims and sleeps on the wall's night and sleep schedule.");
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await expect(p.page.locator('html')).toHaveAttribute('data-layout', 'phone');
  await useWall.click();
  await ask.getByRole('button', { name: 'Use the wall layout' }).click();
  await expect(p.page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  await p.page.locator('.rail button', { hasText: 'Settings' }).click();
  await enterPin(p.page);
  await p.page.getByRole('button', { name: 'About' }).click();
  await p.page.getByRole('button', { name: 'Use the phone layout here' }).click();
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  expect(await p.page.evaluate(() => localStorage.getItem('manwar.layout.v2'))).toBe('phone');
  expect([...w.errors, ...p.errors]).toEqual([]);
});

test('the wall offers the phone layout only on a device that could be a phone', async ({ browser }) => {
  const household = `e2e-pair-${RUN}-phonelayout`;
  // A tablet's wall (not paired) does not offer it.
  const w = await wall(browser, household);
  await w.page.locator('.rail button', { hasText: 'Settings' }).click();
  await w.page.getByRole('button', { name: 'About' }).click();
  await expect(w.page.locator('.set-page')).toContainText('Household account');
  await expect(w.page.getByRole('button', { name: 'Use the phone layout here' })).toHaveCount(0);
  // A phone-sized screen in the wall layout does.
  const page = await (await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' })).newPage();
  await page.goto(`/?demo=${household}&layout=wall&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  await page.locator('.rail button', { hasText: 'Settings' }).click();
  await page.getByRole('button', { name: 'About' }).click();
  await page.getByRole('button', { name: 'Use the phone layout here' }).click();
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).searchParams.get('layout')).toBeNull();
  expect(w.errors).toEqual([]);
});

test('a phone once signed in as the wall opens as a phone next time, and its loading screen offers no wall layout', async ({
  browser,
}) => {
  const household = `e2e-pair-${RUN}-once-wall`;
  const w = await wall(browser, household);
  const ctx = await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' });
  const page = await ctx.newPage();
  // Signed in as the household's wall, in the wall layout (as a phone was before the companion, or by ?layout=wall).
  await page.goto(`/?demo=${household}&layout=wall&${NOW}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  await page.goto(`/?demo=${household}&${NOW}`);
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone');
  // Loading (the household out of reach): no way into the wall layout from here.
  const firestore = /^https?:\/\/[^/]+:8080\//;
  await page.route(firestore, (r) => r.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('.ph-loading')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'This is the wall: use the wall layout' })).toHaveCount(0);
  await page.unroute(firestore);
  expect(w.errors).toEqual([]);
});

test('a small tablet that opened the household as the wall stays one; the wall under Fully Kiosk is one at any size', async ({
  browser,
}) => {
  const household = `e2e-pair-${RUN}-small-wall`;
  const small = { viewport: { width: 853, height: 533 }, screen: { width: 853, height: 533 }, hasTouch: true };
  const tablet = await (await newContext(browser, { ...small, timezoneId: 'America/Chicago' })).newPage();
  await tablet.goto(`/?demo=${household}&layout=wall&${NOW}`);
  await expect(tablet.locator('.shell')).toBeVisible({ timeout: 30_000 });
  await tablet.goto(`/?demo=${household}&${NOW}`);
  await expect(tablet.locator('.shell')).toBeVisible({ timeout: 30_000 });

  // The same screen, never signed in: the pairing screen, which can make it the wall.
  const fresh = await (await newContext(browser, { ...small, timezoneId: 'America/Chicago' })).newPage();
  await fresh.goto(`/?demo=${household}&pair=&${NOW}`);
  await expect(fresh.getByRole('heading', { name: 'Pair this phone' })).toBeVisible({ timeout: 30_000 });
  await fresh.getByRole('button', { name: 'This is the wall: use the wall layout' }).click();
  await expect(fresh.locator('html')).toHaveAttribute('data-layout', 'wall', { timeout: 30_000 });
  await fresh.goto(`/?demo=${household}&${NOW}`);
  await expect(fresh.locator('.shell')).toBeVisible({ timeout: 30_000 });

  // Fully Kiosk's JavaScript Interface: the wall, even on a phone-sized screen.
  const kiosk = await (await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' })).newPage();
  await kiosk.addInitScript(() => {
    (window as unknown as { fully: object }).fully = { setScreenBrightness: () => {}, turnScreenOn: () => {} };
  });
  await kiosk.goto(`/?demo=${household}&${NOW}`);
  await expect(kiosk.locator('.shell')).toBeVisible({ timeout: 30_000 });
});
