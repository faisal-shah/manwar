import { computed, effect } from '@preact/signals';
import { sleepHeldUntil } from '../../core/display';
import { data, put, upsert } from '../../data/store';
import type { WallTimer } from '../../data/types';
import { currentTime, nowMs } from '../../lib/clock';
import { LEAD_MS, SLEEP_GRACE_MS, STALE_MS, validMinutes } from './logic';

export type RunningTimer = WallTimer;

/**
 * The wall's one timer, shared through Firestore (`timers/wall`) so a phone
 * can start, watch and stop it. Stopping it stamps `stoppedAt` (the wall
 * reads from it when scheduled sleep may resume, however late it hears of
 * the stop). One that ended more than STALE_MS ago is left over (nobody was
 * at the wall to dismiss it) and reads as none.
 */
const stored = computed(() => data.timers.value.find((x) => x.id === 'wall') ?? null);

export const timer = computed<RunningTimer | null>(() => {
  const t = stored.value;
  return t && !t.stoppedAt && nowMs.value - t.endAt < STALE_MS ? t : null;
});

/** True from Start until someone stops or dismisses the timer. */
export const timerActive = computed(() => timer.value !== null);

export const timerPhase = computed<'lead' | 'running' | 'done' | null>(() => {
  const t = timer.value;
  if (!t) return null;
  const n = nowMs.value;
  if (n < t.startAt) return 'lead';
  return n < t.endAt ? 'running' : 'done';
});

/** Start the wall's timer (replacing one that runs). `startedBy`: the phone that starts it. */
export function startTimer(minutes: number, startedBy?: string): void {
  if (!validMinutes(minutes)) throw new Error(`startTimer: minutes must be 1-999, got ${minutes}`);
  const startAt = currentTime() + LEAD_MS;
  // A whole new document: no stoppedAt from the last one.
  void put('timers', { id: 'wall', minutes, startAt, endAt: startAt + minutes * 60_000, startedBy });
}

export function stopTimer(): void {
  if (stored.peek()) void upsert('timers', 'wall', { stoppedAt: currentTime() });
}

/**
 * The wall's side: scheduled sleep waits until a few minutes after the timer
 * ends, or after it was stopped. Started once the household is open.
 */
export function holdSleepForTimer(): void {
  effect(() => {
    const t = stored.value;
    sleepHeldUntil.value = t ? Math.min(t.endAt, t.stoppedAt ?? Infinity) + SLEEP_GRACE_MS : 0;
  });
}
