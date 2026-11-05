import { computed, effect, signal } from '@preact/signals';
import { settings, settingsLoaded } from '../data/store';
import type { TimeWindow } from '../data/types';
import { currentTime, now } from '../lib/clock';
import { hhmmToMinutes, minutesOfDay } from '../lib/date';
import { onActivity } from './activity';
import { setBrightness, wakeScreen } from './kiosk';

/**
 * Display states: day (light), night (dark theme, dimmed) and sleep (black,
 * backlight off). Night and sleep follow their daily windows; "Sleep now"
 * forces sleep until the next wake time; a tap during sleep wakes the screen
 * and it stays awake until nobody has touched it for a few minutes; a
 * running timer holds scheduled sleep off.
 */

export function inWindow(w: TimeWindow, minutes: number): boolean {
  if (!w.enabled) return false;
  const a = hhmmToMinutes(w.from);
  const b = hhmmToMinutes(w.to);
  return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

const FORCED_KEY = 'manwar.sleepUntil.v1';

function loadForced(): number {
  try {
    return Number(localStorage.getItem(FORCED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Sleep forced on until this instant ("Sleep now"). Kept in localStorage, so
 * a reload in the night (an update, the kiosk browser restarting) does not
 * turn the screen back on.
 */
export const sleepForcedUntil = signal(typeof localStorage !== 'undefined' ? loadForced() : 0);
/** Awake until this instant: a tap on the sleep screen, then each touch while awake, keeps it on. */
export const wokenUntil = signal(0);
/** Scheduled sleep waits until this instant (a running timer holds it to 5 minutes past its end). */
export const sleepHeldUntil = signal(0);
/** Manual theme override for this session, null = follow the schedule. `?theme=dark` sets it (screenshots, tests). */
const themeParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('theme') : null;
export const themeOverride = signal<'light' | 'dark' | null>(themeParam === 'dark' || themeParam === 'light' ? themeParam : null);

const WAKE_MS = 3 * 60_000;

export const sleeping = computed(() => {
  const t = now.value.getTime();
  if (t < wokenUntil.value) return false;
  if (t < sleepForcedUntil.value) return true;
  if (t < sleepHeldUntil.value) return false;
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
  // Someone using the wall keeps it awake: scheduled sleep starts only after
  // WAKE_MS without a touch. A touch on the sleep screen itself wakes it
  // through wake(), and "Sleep now" (a touch too) clears this hold.
  onActivity(() => {
    if (!sleeping.peek()) wokenUntil.value = Math.max(wokenUntil.peek(), currentTime() + WAKE_MS);
  });
  effect(() => {
    const until = sleepForcedUntil.value;
    try {
      if (until > currentTime()) localStorage.setItem(FORCED_KEY, String(until));
      else localStorage.removeItem(FORCED_KEY);
    } catch {
      /* storage unavailable: forced sleep lasts for this page load only */
    }
  });
  effect(() => {
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.dataset.text = settings.value.textScale;
  });
  effect(() => {
    // The windows come with the household's settings. Until they load, the backlight stays as the last
    // page left it, so a reload at night (an update, the kiosk browser restarting) does not light the room.
    if (!settingsLoaded.value) return;
    setBrightness(sleeping.value ? 0 : theme.value === 'dark' ? 30 : 100);
  });
}
