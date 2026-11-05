import { createHash } from 'node:crypto';
import { devices, expect, type Browser, type Page } from '@playwright/test';
import { FS, newContext, type Opened, OWNER, phone, wall } from './phone-helpers';

/*
 * Helpers for the phone's Today, Tasks and Stars specs: a wall and a phone
 * on one freshly seeded demo household (the wall seeds it; a phone never
 * does), the phone's tabs, and documents written straight to the emulator.
 */

export const RUN = Date.now().toString(36);

/** A wall (which seeds the household) and then a phone on it, the phone on `tab`. */
export async function wallAndPhone(
  browser: Browser,
  name: string,
  { extra = '', tab }: { extra?: string; tab?: 'Today' | 'Tasks' | 'More' } = {},
): Promise<{ household: string; w: Opened; p: Opened; errors: () => string[] }> {
  const household = `phtasks-${RUN}-${name}`;
  const w = await wall(browser, household, extra);
  // The wall seeds the demo family; wait for it before the phone opens.
  await w.page.locator('.rail button', { hasText: 'Tasks' }).click();
  await expect(w.page.locator('[data-column="asiyah"] .star-pill')).toHaveText('128', { timeout: 30_000 });
  const p = await phone(browser, household, extra);
  if (tab) await phoneTab(p.page, tab);
  return { household, w, p, errors: () => [...w.errors, ...p.errors] };
}

/** A phone (Pixel 7) on `household` with its clock pinned at `now` (phone() pins the specs' usual 11:44). */
export async function phoneAt(browser: Browser, household: string, now: string, extra = ''): Promise<Opened> {
  const ctx = await newContext(browser, { ...devices['Pixel 7'], timezoneId: 'America/Chicago' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?demo=${household}&layout=phone&now=${now}${extra}`);
  await expect(page.locator('.ph-nav')).toBeVisible({ timeout: 30_000 });
  return { page, errors };
}

export const phoneTab = (page: Page, tab: string) => page.locator('.ph-nav button', { hasText: tab }).click();

/** On the phone's Tasks tab: one person's chip, and a task card in the list shown. */
export const chip = (page: Page, id: string) => page.locator(`.pt-chip[data-person="${id}"]`);
export const phoneCard = (page: Page, title: string) => page.locator(`.pt .tk-card[data-task="${title}"]`);
export const phoneStars = (page: Page) => page.locator('.pt .pcol-head .star-pill');
export const phoneProgress = (page: Page) => page.locator('.pt .pcol-head .progress-pill');

/** On the wall's Tasks tab. */
export const wallCard = (page: Page, col: string, title: string) =>
  page.locator(`[data-column="${col}"] .tk-card[data-task="${title}"]`);
export const wallStars = (page: Page, col: string) => page.locator(`[data-column="${col}"] .star-pill`);

/** The household's document path in the emulator (`timers/wall`, `profiles/mamma`). */
const docUrl = (household: string, path: string) => `${FS}/households/demo-${household}/${path}`;

type Field = { stringValue: string } | { integerValue: string } | { booleanValue: boolean } | { mapValue: unknown };

/** Write (create or replace) a document straight to the emulator. */
export async function writeDoc(household: string, path: string, fields: Record<string, Field>): Promise<void> {
  const res = await fetch(docUrl(household, path), {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  expect(res.ok, await res.text()).toBe(true);
}

/** A field of a document on the server (null when the document or field is missing). */
export async function serverField(household: string, path: string, field: string): Promise<unknown> {
  const res = await fetch(docUrl(household, path), { headers: OWNER });
  if (res.status === 404) return null;
  const doc = (await res.json()) as { fields?: Record<string, Record<string, unknown>> };
  const v = doc.fields?.[field];
  if (!v) return null;
  return v.integerValue !== undefined ? Number(v.integerValue) : (v.stringValue ?? v.booleanValue ?? v);
}

/** A collection's documents on the server, each as its plain string and number fields. */
export async function serverDocs(household: string, collection: string): Promise<Record<string, string | number>[]> {
  const res = await fetch(`${docUrl(household, collection)}?pageSize=1000`, { headers: OWNER });
  const body = (await res.json()) as {
    documents?: { fields: Record<string, { stringValue?: string; integerValue?: string }> }[];
  };
  return (body.documents ?? []).map((d) =>
    Object.fromEntries(
      Object.entries(d.fields).map(([k, v]) => [
        k,
        v.integerValue !== undefined ? Number(v.integerValue) : (v.stringValue ?? ''),
      ]),
    ),
  );
}

export const PIN = '1234';

/** Set the parent PIN the way core/lock.ts stores it, straight into the emulator. */
export async function setPin(household: string, pin = PIN): Promise<void> {
  const salt = 'e2e-salt';
  const pinHash = createHash('sha256').update(`${salt}:${pin}`).digest('hex');
  const res = await fetch(`${docUrl(household, 'settings/main')}?updateMask.fieldPaths=lock`, {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        lock: {
          mapValue: {
            fields: { salt: { stringValue: salt }, pinHash: { stringValue: pinHash }, relockMinutes: { integerValue: '2' } },
          },
        },
      },
    }),
  });
  expect(res.ok, await res.text()).toBe(true);
}

export async function enterPin(page: Page, pin = PIN): Promise<void> {
  const pad = page.getByRole('dialog', { name: 'Parent PIN' });
  await expect(pad).toBeVisible();
  for (const d of pin) await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(pad).toHaveCount(0);
}

/** Wait for the phone's own history.back() (an overlay closed another way) before Playwright's goBack. */
export async function backSettled(page: Page, depth: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => (history.state as { manwarBack?: number } | null)?.manwarBack ?? 0)).toBe(depth);
}
