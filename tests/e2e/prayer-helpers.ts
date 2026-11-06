import { expect, type Page } from '@playwright/test';
import { FS, OWNER } from './phone-helpers';

/*
 * Helpers for the prayer face's specs. The prayer clock's settings are the
 * household's `settings/prayer` document, and the place it calculates for
 * is the household's (`settings/main.place`); a spec writes them through
 * the emulator's REST API before the wall opens, and reads them back to see
 * what a change wrote.
 */

export const RUN = Date.now().toString(36);
let opened = 0;

/** The household place (data/types.ts `Place`) the prayer specs' times are for. */
export const CHICAGO = { name: 'Chicago, Illinois', lat: 41.8781, lon: -87.6298, timezone: 'America/Chicago' };

type Value = Record<string, unknown>;

/** A plain value as a Firestore REST value. */
export function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, toValue(x)])) } };
}

/** A Firestore REST value as a plain value. */
export function fromValue(v: Value): unknown {
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: Value[] }).values ?? []).map(fromValue);
  if ('mapValue' in v) {
    const fields = (v.mapValue as { fields?: Record<string, Value> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, fromValue(x)]));
  }
  throw new Error(`unknown value ${JSON.stringify(v)}`);
}

const docUrl = (household: string, path: string) => `${FS}/households/demo-${household}/${path}`;

/** Write these top-level fields of a household document (others are kept). */
export async function writeFields(household: string, path: string, fields: Record<string, unknown>): Promise<void> {
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const res = await fetch(`${docUrl(household, path)}?${mask}`, {
    method: 'PATCH',
    headers: { ...OWNER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }),
  });
  expect(res.ok, await res.text()).toBe(true);
}

/** A household document as stored ({} while there is none). */
async function readDoc(household: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(docUrl(household, path), { headers: OWNER });
  if (res.status === 404) return {};
  return fromValue({ mapValue: await res.json() }) as Record<string, unknown>;
}

/** The prayer settings document as stored ({} while there is none). */
export const prayerDoc = (household: string) => readDoc(household, 'settings/prayer');

/** The household's settings document as stored ({} while there is none). */
export const mainDoc = (household: string) => readDoc(household, 'settings/main');

/** A fixed forecast (Manwar's weather and the prayer face's both read it): the real Open-Meteo answers a suite with 429s. */
const FORECAST = {
  current: { temperature_2m: 18, weather_code: 1, is_day: 1 },
  daily: {
    time: Array.from({ length: 10 }, (_, i) => `2026-10-${String(26 + i).padStart(2, '0')}`),
    weather_code: Array(10).fill(1),
    temperature_2m_max: Array(10).fill(21),
    temperature_2m_min: Array(10).fill(9),
  },
};

/** Collect the page's errors (not the emulator being slow, which the app reports itself). */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Could not reach Cloud Firestore backend/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

export interface OpenedWall {
  household: string;
  errors: string[];
}

/**
 * The wall on a new demo household in Chicago (`place: null` for no place
 * yet), with `prayer` over the prayer clock's defaults, at `now` (a local
 * time, or '' for the page's own clock, which a spec may fake), on the
 * prayer face unless `face` says otherwise. `wall` fields go into the
 * household's settings (a resting face, a sleep window).
 */
export async function openWall(
  page: Page,
  now: string,
  prayer: Record<string, unknown> = {},
  {
    face = 'prayer',
    wall,
    place = CHICAGO,
  }: { face?: 'prayer' | 'family'; wall?: Record<string, unknown>; place?: typeof CHICAGO | null } = {},
): Promise<OpenedWall> {
  const household = `prayer-${RUN}-${++opened}`;
  if (Object.keys(prayer).length) await writeFields(household, 'settings/prayer', prayer);
  const main = { ...(place ? { place } : {}), ...wall };
  if (Object.keys(main).length) await writeFields(household, 'settings/main', main);
  const errors = trackErrors(page);
  await page.route('**/api.open-meteo.com/**', (r) => r.fulfill({ json: FORECAST }));
  await page.goto(`/?demo=${household}&face=${face}${now ? `&now=${now}` : ''}`);
  await expect(page.locator('.shell')).toBeAttached({ timeout: 30_000 });
  if (face === 'prayer') await expect(page.locator('.prayer-face')).toBeVisible({ timeout: 30_000 });
  return { household, errors };
}

/** The prayer face's own controls (the family face under it is inert, which role queries do not see). */
export const face = (page: Page) => page.locator('.prayer-face');
