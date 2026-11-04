import { computed, effect, signal } from '@preact/signals';
import { settings } from '../data/store';
import type { TimeWindow } from '../data/types';
import { currentTime, now } from '../lib/clock';
import { hhmmToMinutes, minutesOfDay } from '../lib/date';
import { setBrightness, wakeScreen } from './kiosk';

/**
 * Display states: day (light), night (dark theme, dimmed) and sleep (black,
 * backlight off). Night and sleep follow their daily windows; "Sleep now"
 * forces sleep until the next wake time; a tap during sleep wakes the screen
 * for a few minutes.
 */

export function inWindow(w: TimeWindow, minutes: number): boolean {
  if (!w.enabled) return false;
  const a = hhmmToMinutes(w.from);
  const b = hhmmToMinutes(w.to);
  return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

/** Sleep forced on until this instant ("Sleep now"). */
export const sleepForcedUntil = signal(0);
/** Woken by a tap until this instant. */
export const wokenUntil = signal(0);
/** Manual theme override for this session, null = follow the schedule. */
export const themeOverride = signal<'light' | 'dark' | null>(null);

const WAKE_MS = 3 * 60_000;

export const sleeping = computed(() => {
  const t = now.value.getTime();
  if (t < wokenUntil.value) return false;
  if (t < sleepForcedUntil.value) return true;
  return inWindow(settings.value.sleep, minutesOfDay(now.value));
});

export const theme = computed<'light' | 'dark'>(() => {
  if (themeOverride.value) return themeOverride.value;
  return inWindow(settings.value.night, minutesOfDay(now.value)) || sleeping.value ? 'dark' : 'light';
});

/** Sleep until the end of the sleep window (or for 8 hours without one). */
export function sleepNow(): void {
  const s = settings.value.sleep;
  const d = new Date(currentTime());
  const wake = new Date(d);
  const [h, m] = (s.enabled ? s.to : '07:00').split(':').map(Number);
  wake.setHours(h, m, 0, 0);
  if (wake.getTime() <= d.getTime()) wake.setDate(wake.getDate() + 1);
  wokenUntil.value = 0;
  sleepForcedUntil.value = wake.getTime();
}

export function wake(): void {
  sleepForcedUntil.value = 0;
  wokenUntil.value = currentTime() + WAKE_MS;
  wakeScreen();
}

export function startDisplay(): void {
  effect(() => {
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.dataset.text = settings.value.textScale;
  });
  effect(() => {
    setBrightness(sleeping.value ? 0 : theme.value === 'dark' ? 30 : 100);
  });
}
