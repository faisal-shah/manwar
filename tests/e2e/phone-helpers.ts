import { devices, expect, type Browser, type Page } from '@playwright/test';

/*
 * Helpers for the phone companion's specs. A phone is a Pixel 7 browser
 * context (touch, 412x915 CSS px). `phone()` opens the phone layout signed
 * in as the demo wall (fast, for the phone's screens); `pairPhone()` pairs a
 * real phone through the wall's Settings > Phones (needs the Functions
 * emulator), for what depends on being a paired device (no PIN, removal).
 */

export const FS = 'http://127.0.0.1:8080/v1/projects/demo-manwar/databases/(default)/documents';
export const OWNER = { Authorization: 'Bearer owner' };
export const NOW = 'now=2026-11-04T11:44';

export interface Opened {
  page: Page;
  errors: string[];
}

function track(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // A failed listener or an emulator that is slow to answer is reported by the app, not a page error.
    if (m.type() === 'error' && !/Could not reach Cloud Firestore backend/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** The wall on a demo household. */
export async function wall(browser: Browser, household: string, extra = ''): Promise<Opened> {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Chicago' });
  const page = await ctx.newPage();
  const errors = track(page);
  await page.goto(`/?demo=${household}&${NOW}${extra}`);
  await expect(page.locator('.shell')).toBeVisible({ timeout: 30_000 });
  return { page, errors };
}

const phoneContext = (browser: Browser) => browser.newContext({ ...devices['Pixel 7'], timezoneId: 'America/Chicago' });

/** The phone layout on a demo household, signed in as its wall (no pairing). */
export async function phone(browser: Browser, household: string, extra = ''): Promise<Opened> {
  const page = await (await phoneContext(browser)).newPage();
  const errors = track(page);
  await page.goto(`/?demo=${household}&layout=phone&${NOW}${extra}`);
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  return { page, errors };
}

/** A pairing code from the wall's Settings > Phones (the sheet is left open on the code). */
export async function pairingCode(w: Page): Promise<string> {
  await w.locator('.rail button', { hasText: 'Settings' }).click();
  await w.getByRole('button', { name: 'Phones' }).click();
  await w.getByRole('button', { name: 'Add a phone' }).click();
  const code = w.locator('.pair-code');
  await expect(code).toHaveText(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/, { timeout: 20_000 });
  return (await code.textContent())!.replace('-', '');
}

/** Open a new phone on the pairing link `code` makes (as the QR code does) and pair it as `name`. */
export async function redeem(browser: Browser, household: string, code: string, name: string): Promise<Opened> {
  const page = await (await phoneContext(browser)).newPage();
  const errors = track(page);
  await page.goto(`/?demo=${household}&pair=${code}&${NOW}`);
  await page.getByLabel('Name for this phone').fill(name);
  await page.getByRole('button', { name: 'Pair', exact: true }).click();
  return { page, errors };
}

/** A phone paired to `household` through its wall `w`. */
export async function pairPhone(browser: Browser, w: Page, household: string, name = "Mamma's phone"): Promise<Opened> {
  const code = await pairingCode(w);
  const p = await redeem(browser, household, code, name);
  await expect(p.page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  return p;
}
