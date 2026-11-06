import type { WallTimer } from '../../data/types';

/** Pure timer helpers (keypad input, display, color stages). */

export const MAX_MINUTES = 999;
/** The "3, 2, 1" lead-in before the timer starts running. */
export const LEAD_MS = 3000;
/** Scheduled sleep stays off until this long after a timer ends. */
export const SLEEP_GRACE_MS = 5 * 60_000;
/** A finished timer nobody dismissed is cleared this long after its end. */
export const STALE_MS = 10 * 60_000;
/** The chime sounds only for a timer that finished this recently (not on a reload long after). */
export const CHIME_WINDOW_MS = 30_000;

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'clear' | 'back';

/** Minutes keypad: up to three digits, no leading zero. */
export function pressKey(value: string, key: KeypadKey): string {
  if (key === 'clear') return '';
  if (key === 'back') return value.slice(0, -1);
  if (value === '' && key === '0') return value;
  return value.length >= String(MAX_MINUTES).length ? value : value + key;
}

export const validMinutes = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_MINUTES;

/** The document of the runs phones start (a wall's own runs are in `timers/<its id>`). */
export const PHONE_TIMER = 'wall';

/** A new run of `minutes` in document `id`, started at `now` (by phone `startedBy`, when one did): it counts down after the lead-in. */
export function newRun(id: string, run: string, minutes: number, now: number, startedBy?: string): WallTimer {
  if (!validMinutes(minutes)) throw new Error(`newRun: minutes must be 1-${MAX_MINUTES}, got ${minutes}`);
  const startAt = now + LEAD_MS;
  return { id, run, minutes, startAt, endAt: startAt + minutes * 60_000, startedBy };
}

/** The latest started of `runs`, or null. */
export const latestRun = (runs: readonly WallTimer[]): WallTimer | null =>
  runs.reduce<WallTimer | null>((a, t) => (!a || t.startAt > a.startAt ? t : a), null);

/** When the document's run was stopped, if it was (a stop for another run does not count). */
export const stoppedAt = (t: WallTimer): number | undefined => t.stopped?.[t.run];

/** The run is on the wall at `now`: not stopped, and not left over (ended more than STALE_MS ago, nobody dismissed it). */
export const onWall = (t: WallTimer, now: number): boolean => stoppedAt(t) === undefined && now - t.endAt < STALE_MS;

/** Until when the stored timer holds the wall's scheduled sleep off: a few minutes past its end, or past its stop. */
export const timerSleepHold = (t: WallTimer | null | undefined): number =>
  t ? Math.min(t.endAt, stoppedAt(t) ?? Infinity) + SLEEP_GRACE_MS : 0;

/** Remaining time as whole minutes and seconds, rounded up to the second. */
export function splitRemaining(ms: number): { mins: number; secs: number } {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return { mins: Math.floor(s / 60), secs: s % 60 };
}

/** "4:05" (minutes and seconds left), "1:02:05" past an hour. */
export function clockLeft(ms: number): string {
  const { mins, secs } = splitRemaining(ms);
  const s = String(secs).padStart(2, '0');
  if (mins < 60) return `${mins}:${s}`;
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}:${s}`;
}

/** "15 min", "1 hr", "2 hr 5 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export type TimerStage = 'blue' | 'green' | 'orange' | 'red';

/** The pie's color as time runs down (remaining fraction 1 to 0), as on Skylight. */
export function timerStage(remaining: number): TimerStage {
  if (remaining > 0.5) return 'blue';
  if (remaining > 0.25) return 'green';
  if (remaining > 0.1) return 'orange';
  return 'red';
}

/** Stage colors, taken from the profile palette (data colors, like profile colors). */
export const STAGE_COLORS: Record<TimerStage, string> = {
  blue: '#2177AE',
  green: '#408157',
  orange: '#F2A33A',
  red: '#CB434C',
};
