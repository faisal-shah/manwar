import { computed, signal } from '@preact/signals';
import { sleepHeldUntil } from '../../core/display';
import { currentTime, nowMs } from '../../lib/clock';
import { LEAD_MS, SLEEP_GRACE_MS, validMinutes } from './logic';

export interface RunningTimer {
  minutes: number;
  /** End of the lead-in countdown; the timer runs from here. */
  startAt: number;
  endAt: number;
}

/** The wall's one timer (in memory; a reload drops it). */
export const timer = signal<RunningTimer | null>(null);

/** True from Start until someone stops or dismisses the timer. */
export const timerActive = computed(() => timer.value !== null);

export const timerPhase = computed<'lead' | 'running' | 'done' | null>(() => {
  const t = timer.value;
  if (!t) return null;
  const n = nowMs.value;
  if (n < t.startAt) return 'lead';
  return n < t.endAt ? 'running' : 'done';
});

export function startTimer(minutes: number): void {
  if (!validMinutes(minutes)) throw new Error(`startTimer: minutes must be 1-999, got ${minutes}`);
  const startAt = currentTime() + LEAD_MS;
  const endAt = startAt + minutes * 60_000;
  timer.value = { minutes, startAt, endAt };
  // Scheduled sleep waits until a few minutes after the timer ends.
  sleepHeldUntil.value = endAt + SLEEP_GRACE_MS;
}

export function stopTimer(): void {
  timer.value = null;
  sleepHeldUntil.value = Math.min(sleepHeldUntil.value, currentTime() + SLEEP_GRACE_MS);
}
