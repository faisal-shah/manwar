import type { Place } from './types';

/*
 * The one-time move of the household's place into `settings/main.place`,
 * pure (the wall runs it at start: app/migrate.ts). Before it the place
 * was kept twice, by the weather (`settings/main.weather`: name, lat, lon)
 * and by the prayer clock (`settings/prayer.place`: name, latitude,
 * longitude, timezone), and the prayer clock had its own time format and
 * weather unit (`clock24h`, `weather: { enabled, unit }`). The stored
 * documents are read as outside input.
 */

/** What the move writes: the household place (when it has none yet), and the old fields deleted. */
export interface PlaceWrite {
  kind: 'write';
  main: { place?: Place; remove: string[] };
  prayer: { set: Record<string, unknown>; remove: string[] };
}

/** The place to move has no time zone (the weather's never had one): look it up first, then plan again with it. */
export interface PlaceLookup {
  kind: 'lookup';
  lat: number;
  lon: number;
}

type Doc = Record<string, unknown>;

const isMap = (v: unknown): v is Doc => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCoord = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** A stored place as the old fields had it (the time zone may be missing), or null. */
function oldPlace(
  name: unknown,
  lat: unknown,
  lon: unknown,
  timezone: unknown,
): (Omit<Place, 'timezone'> & { timezone?: string }) | null {
  if (!isCoord(lat, 90) || !isCoord(lon, 180)) return null;
  return {
    name: nonEmpty(name) ? name.trim() : `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    lat,
    lon,
    ...(nonEmpty(timezone) ? { timezone } : {}),
  };
}

/**
 * What moving the place writes, given the two stored documents (`main`,
 * `prayer`) and, after a lookup, the time zone at the place to move; null
 * when there is nothing left to move (the move is idempotent). The prayer
 * clock's place comes first: it has the time zone.
 */
export function planPlaceMove(main: unknown, prayer: unknown, timezone?: string): PlaceWrite | PlaceLookup | null {
  const m = isMap(main) ? main : {};
  const p = isMap(prayer) ? prayer : {};
  const w = isMap(m.weather) ? m.weather : {};
  const pp = isMap(p.place) ? p.place : {};
  const pw = isMap(p.weather) ? p.weather : null;

  let place: Place | undefined;
  const has = isMap(m.place) && isCoord(m.place.lat, 90) && isCoord(m.place.lon, 180) && nonEmpty(m.place.timezone);
  if (!has) {
    const from = oldPlace(pp.name, pp.latitude, pp.longitude, pp.timezone) ?? oldPlace(w.name, w.lat, w.lon, undefined);
    if (from) {
      const tz = from.timezone ?? timezone;
      if (!tz) return { kind: 'lookup', lat: from.lat, lon: from.lon };
      place = { ...from, timezone: tz };
    }
  }
  const mainRemove = 'weather' in m ? ['weather'] : [];
  const prayerRemove = ['place', 'clock24h', 'weather'].filter((k) => k in p);
  // The prayer face's weather turned off stays off.
  const prayerSet: Doc = pw?.enabled === false && !('showWeather' in p) ? { showWeather: false } : {};
  if (!place && !mainRemove.length && !prayerRemove.length) return null;
  return {
    kind: 'write',
    main: { ...(place ? { place } : {}), remove: mainRemove },
    prayer: { set: prayerSet, remove: prayerRemove },
  };
}
