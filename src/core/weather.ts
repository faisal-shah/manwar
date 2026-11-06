import { computed, effect, signal } from '@preact/signals';
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

/**
 * The weather at the household's place (Settings > Location), the one
 * reading the wall shows: the top bar, the calendar's days and the prayer
 * face. Null before the first reading, and without a place.
 */
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
  if (typeof c?.temperature_2m !== 'number' || typeof c?.weather_code !== 'number' || !Array.isArray(d?.time))
    throw new Error('weather: bad payload');
  const daily: Record<ISODate, DayForecast> = {};
  d.time.forEach((day: string, i: number) => {
    daily[day] = { code: d.weather_code[i], maxC: d.temperature_2m_max[i], minC: d.temperature_2m_min[i] };
  });
  return { tempC: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, daily, fetchedAt: Date.now() };
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

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: 'Clear',
  partly: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Storm',
};

export const toUnit = (c: number, unit: 'f' | 'c') => Math.round(unit === 'f' ? c * 1.8 + 32 : c);

const REFRESH_MS = 15 * 60_000;
let timer: ReturnType<typeof setInterval> | undefined;
let reload: (() => void) | null = null;

/** The place's position as a key, so other settings changes (its name, the units) do not refetch. */
const placeKey = computed(() => {
  const p = settings.value.place;
  return p ? `${p.lat},${p.lon}` : null;
});

/** Keep `weather` current for the household's place (the wall only: a phone shows no weather). */
export function startWeather(): void {
  effect(() => {
    const key = placeKey.value;
    clearInterval(timer);
    // A reading for another place is wrong, not just old.
    weather.value = null;
    reload = null;
    if (!key) return;
    const [lat, lon] = key.split(',').map(Number);
    const load = () =>
      fetchWeather(lat, lon)
        .then((w) => {
          if (placeKey.peek() === key) weather.value = w;
        })
        .catch(() => {
          /* keep the last reading (it stops showing once stale: app/status.ts); retry on the next tick */
        });
    reload = load;
    void load();
    timer = setInterval(load, REFRESH_MS);
  });
  window.addEventListener('online', () => reload?.());
}
