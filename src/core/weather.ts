import { effect, signal } from '@preact/signals';
import { settings } from '../data/store';
import type { ISODate } from '../data/types';

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface DayForecast {
  code: number;
  maxC: number;
  minC: number;
}

export interface Weather {
  tempC: number;
  code: number;
  isDay: boolean;
  daily: Record<ISODate, DayForecast>;
  fetchedAt: number;
}

export const weather = signal<Weather | null>(null);

/** Open-Meteo (free, no key, CORS-enabled): current conditions plus a 10-day daily forecast. */
export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,weather_code,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&forecast_days=10&timezone=auto';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`weather: HTTP ${r.status}`);
  const j = await r.json();
  const c = j?.current;
  const d = j?.daily;
  if (typeof c?.temperature_2m !== 'number' || !Array.isArray(d?.time)) throw new Error('weather: bad payload');
  const daily: Record<ISODate, DayForecast> = {};
  d.time.forEach((day: string, i: number) => {
    daily[day] = { code: d.weather_code[i], maxC: d.temperature_2m_max[i], minC: d.temperature_2m_min[i] };
  });
  return { tempC: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, daily, fetchedAt: Date.now() };
}

export interface Place {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

/** Place search for the weather location (Open-Meteo geocoding). */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en`);
  if (!r.ok) throw new Error(`geocoding: HTTP ${r.status}`);
  const j = await r.json();
  return (j?.results ?? [])
    .filter((x: any) => typeof x?.latitude === 'number' && typeof x?.longitude === 'number')
    .map((x: any) => ({
      name: String(x.name),
      detail: [x.admin1, x.country].filter(Boolean).join(', '),
      lat: x.latitude,
      lon: x.longitude,
    }));
}

/** WMO weather interpretation codes. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain';
  if (code <= 77 || code === 85 || code === 86) return 'snow';
  return 'storm';
}

export const toUnit = (c: number, unit: 'f' | 'c') => Math.round(unit === 'f' ? c * 1.8 + 32 : c);

const REFRESH_MS = 30 * 60_000;
let timer: ReturnType<typeof setInterval> | undefined;

/** Keep `weather` current for the configured location. */
export function startWeather(): void {
  effect(() => {
    const loc = settings.value.weather;
    clearInterval(timer);
    if (!loc) {
      weather.value = null;
      return;
    }
    const load = () =>
      fetchWeather(loc.lat, loc.lon)
        .then((w) => (weather.value = w))
        .catch(() => {
          /* keep the last reading; retry on the next tick */
        });
    void load();
    timer = setInterval(load, REFRESH_MS);
  });
}
