import { computed, effect } from '@preact/signals';
import { endForcedSleep, sleepHeldUntil } from '../../core/display';
import { data, newId, patch, put, transaction } from '../../data/store';
import type { WallTimer } from '../../data/types';
import { currentTime, nowMs } from '../../lib/clock';
import { newRun, onWall, stoppedAt, timerSleepHold } from './logic';

export type RunningTimer = WallTimer;

/**
 * The wall's one timer, shared through Firestore (`timers/wall`) so a phone
 * can start, watch and stop it. Each start is a new run (its own id) written
 * over the last; a stop is stamped under the id of the run it stops, so a
 * stop that lands late (a device that had not heard of the newer run) stops
 * nothing. The document stays after a stop: the wall reads from it when
 * scheduled sleep may resume, however late it hears of the stop. A run that
 * ended more than STALE_MS ago is left over (nobody was at the wall to
 * dismiss it) and reads as none.
 */
const stored = computed(() => data.timers.value.find((x) => x.id === 'wall') ?? null);

export const timer = computed<RunningTimer | null>(() => {
  const t = stored.value;
  return t && onWall(t, nowMs.value) ? t : null;
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

const stop = (run: string) => ({ [`stopped.${run}`]: currentTime() }) as Partial<WallTimer>;

/** Start a timer at the wall (replacing one that runs). Written here at once, as every wall write is. */
export function startTimer(minutes: number): void {
  void put('timers', newRun(newId(), minutes, currentTime()));
}

/** Stop or dismiss run `t` at the wall. */
export function stopTimer(t: WallTimer): void {
  void patch('timers', 'wall', stop(t.run));
}

/*
 * A phone starts and stops the timer through the server (a transaction): an
 * offline phone is told at once that it could not reach the wall, rather
 * than queueing a start or a stop that would land later on whatever the
 * wall shows by then. Both reject when the server cannot be reached.
 */

/**
 * Start a timer from a phone (`device`, when paired). False (nothing
 * written) when the wall already shows one: started meanwhile elsewhere.
 */
export function startTimerFromPhone(minutes: number, device?: string): Promise<boolean> {
  return transaction(async (tx) => {
    const cur = await tx.get('timers', 'wall');
    if (cur && onWall(cur, currentTime())) return false;
    tx.put('timers', newRun(newId(), minutes, currentTime(), device));
    return true;
  });
}

/** Stop run `t` from a phone. False when the wall has another run now (started since); true once `t` is stopped. */
export function stopTimerFromPhone(t: WallTimer): Promise<boolean> {
  return transaction(async (tx) => {
    const cur = await tx.get('timers', 'wall');
    if (cur?.run !== t.run) return false;
    if (stoppedAt(cur) === undefined) tx.patch('timers', 'wall', stop(t.run));
    return true;
  });
}

/**
 * The wall's side: scheduled sleep waits until a few minutes after the timer
 * ends, or after it was stopped; and a new run ends Sleep now, so a timer
 * started from a phone shows on the wall. The run already there when the
 * wall opens does not: it may be older than the Sleep now. Started once the
 * household is open.
 */
export function holdSleepForTimer(): void {
  let seen = stored.peek()?.run;
  effect(() => {
    sleepHeldUntil.value = timerSleepHold(stored.value);
    const t = timer.value;
    if (!t || t.run === seen) return;
    seen = t.run;
    endForcedSleep();
  });
}
