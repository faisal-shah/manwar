import type { TimeWindow } from '../data/types';
import { hhmmToMinutes, minutesOfDay } from '../lib/date';

/**
 * The sleep rule, pure: the wall decides with it from its own state
 * (core/display.ts `sleeping`), a phone guesses with it from the household's
 * data (what a phone last asked, the sleep window, the timer).
 */

export function inWindow(w: TimeWindow, minutes: number): boolean {
  if (!w.enabled) return false;
  const a = hhmmToMinutes(w.from);
  const b = hhmmToMinutes(w.to);
  return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

/** A wake (a tap, a phone's Wake up) lasts at least this long; each touch on the wall while awake extends it. */
export const WAKE_MS = 3 * 60_000;

/** When "Sleep now" at `at` ends: the next end of the sleep window, or the next 7:00 without one. */
export function sleepNowEnd(sleep: TimeWindow, at: number): number {
  const wake = new Date(at);
  const [h, m] = (sleep.enabled ? sleep.to : '07:00').split(':').map(Number);
  wake.setHours(h, m, 0, 0);
  if (wake.getTime() <= at) wake.setDate(wake.getDate() + 1);
  return wake.getTime();
}

export interface SleepState {
  /** Awake until this instant (a tap, Wake up). */
  wokenUntil: number;
  /** Asleep until this instant (Sleep now). */
  forcedUntil: number;
  /** Scheduled sleep waits until this instant (a timer). */
  heldUntil: number;
}

/** Asleep at `t`: woken beats Sleep now, which beats a timer's hold, which beats the sleep window. */
export function asleepAt(t: number, s: SleepState, sleep: TimeWindow): boolean {
  if (t < s.wokenUntil) return false;
  if (t < s.forcedUntil) return true;
  if (t < s.heldUntil) return false;
  return inWindow(sleep, minutesOfDay(new Date(t)));
}
