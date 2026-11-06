import type { Place } from '../data/types';

/**
 * Finding the household's place (data/types.ts `Place`): search by name,
 * this device's location, and a place's time zone. Every answer here is
 * outside input, checked before it becomes a Place.
 */

/** A search answer: the place, and where it is ("Texas, United States") to tell namesakes apart. */
export interface PlaceResult {
  place: Place;
  detail: string;
}

const isCoord = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** "Houston, Texas": the place and its region, without the country. */
const placeName = (name: string, region: string) => (region && region !== name ? `${name}, ${region}` : name);

/**
 * Places by name (Open-Meteo geocoding: free, no key). An answer without a
 * time zone is left out: the prayer clock keeps the place's day by it.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en`);
  if (!r.ok) throw new Error(`geocoding: HTTP ${r.status}`);
  const j = (await r.json()) as { results?: unknown } | null;
  const results: unknown[] = Array.isArray(j?.results) ? j.results : [];
  return results.flatMap((x) => {
    const p = (x ?? {}) as Record<string, unknown>;
    const name = text(p.name);
    const timezone = text(p.timezone);
    if (!name || !timezone || !isCoord(p.latitude, 90) || !isCoord(p.longitude, 180)) return [];
    const region = text(p.admin1);
    return [
      {
        place: { name: placeName(name, region), lat: p.latitude, lon: p.longitude, timezone },
        detail: [region, text(p.country)].filter(Boolean).join(', '),
      },
    ];
  });
}

/** This device's time zone. */
export const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Whether a zone is this device's, under either of its names (Asia/Kolkata is Asia/Calcutta). */
export function isDeviceTimezone(tz: string): boolean {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone === deviceTimezone();
  } catch {
    return tz === deviceTimezone();
  }
}

/** What a tablet set to another time zone than its place's says (the prayer times show on its clock), or null. */
export const timezoneNote = (p: Place): string | null =>
  isDeviceTimezone(p.timezone)
    ? null
    : `This tablet's time zone is ${deviceTimezone()}, but ${p.name} uses ${p.timezone}. The prayer times show on the tablet's clock: set the tablet's time zone to match.`;

/**
 * Where this device is, named by BigDataCloud's free client-side reverse
 * geocoder (the coordinates stand as the name when it does not answer), in
 * the device's own time zone. Rejects with the GeolocationPositionError when
 * the position is refused or not found.
 */
export async function locateDevice(): Promise<Place> {
  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 20_000,
      maximumAge: 3600_000,
    }),
  );
  const { latitude: lat, longitude: lon } = pos.coords;
  let name = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    );
    const j = (await r.json()) as Record<string, unknown> | null;
    const city = text(j?.city) || text(j?.locality);
    if (city) name = placeName(city, text(j?.principalSubdivision));
  } catch {
    // The coordinates stay the name; the place itself is what matters.
  }
  return { name, lat, lon, timezone: deviceTimezone() };
}

/** The time zone at a position (Open-Meteo's forecast API names it). */
export async function timezoneAt(lat: number, lon: number): Promise<string> {
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto`);
  if (!r.ok) throw new Error(`time zone: HTTP ${r.status}`);
  const tz = text(((await r.json()) as Record<string, unknown> | null)?.timezone);
  if (!tz) throw new Error('time zone: bad payload');
  return tz;
}
