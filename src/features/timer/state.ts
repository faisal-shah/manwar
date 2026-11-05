import { computed, effect } from '@preact/signals';
import { isPhone } from '../../app/layout';
import { endForcedSleep, sleepHeldUntil } from '../../core/display';
import { data, newId, patch, put, transaction } from '../../data/store';
import type { WallTimer } from '../../data/types';
import { currentTime, nowMs } from '../../lib/clock';
import { stored } from '../../lib/stored';
import { latestRun, newRun, onWall, PHONE_TIMER, stoppedAt, timerSleepHold } from './logic';

export type RunningTimer = WallTimer;

/*
 * The wall's timer, shared through Firestore so a phone can start, watch and
 * stop it. A wall's own runs live in its own document (`timers/<its id>`),
 * so a second tablet in the household neither shows nor ends them; the runs
 * a phone starts live in `timers/wall` (PHONE_TIMER) and show on every wall.
 * Each start is a new run (its own id) written over the last in its
 * document; a stop is stamped under the id of the run it stops, so a stop
 * that lands late (a device that had not heard of the newer run) stops
 * nothing. A document stays after a stop: the wall reads from it when
 * scheduled sleep may resume, however late it hears of the stop. A run that
 * ended more than STALE_MS ago is left over (nobody was at the wall to
 * dismiss it) and reads as none.
 */

/** This tablet's own timer document id; null on a phone. Made once, kept on the device. */
const wallId: string | null = (() => {
  if (isPhone) return null;
  const id = stored('manwar.wallId.v1', '', (v): v is string => typeof v === 'string');
  if (!id.peek()) id.value = newId();
  return id.peek();
})();

/** The timer documents this device shows: on a wall its own and the phone's, on a phone every one. */
const shown = computed(() => data.timers.value.filter((t) => wallId === null || t.id === wallId || t.id === PHONE_TIMER));

/** The run on screen: the latest started of those still on the wall (not stopped, not left over). */
export const timer = computed<RunningTimer | null>(() => {
  const now = nowMs.value;
  return latestRun(shown.value.filter((t) => onWall(t, now)));
});

/** The latest run this device shows, stopped or not (what a phone guesses the wall's screen from). */
export const lastRun = computed(() => latestRun(shown.value));

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

/**
 * Start a timer at the wall, in its own document. It replaces the one on
 * screen: a phone's run still going is stopped. Written here at once, as
 * every wall write is.
 */
export function startTimer(minutes: number): void {
  const phoneRun = timer.peek();
  if (phoneRun?.id === PHONE_TIMER) stopTimer(phoneRun);
  void put('timers', newRun(wallId!, newId(), minutes, currentTime()));
}

/** Stop or dismiss run `t` at the wall. */
export function stopTimer(t: WallTimer): void {
  void patch('timers', t.id, stop(t.run));
}

/*
 * A phone starts and stops the timer through the server (a transaction): an
 * offline phone is told at once that it could not reach the wall, rather
 * than queueing a start or a stop that would land later on whatever the
 * wall shows by then. Both reject when the server cannot be reached.
 */

/**
 * Start a timer from a phone (`device`, when paired). False (nothing
 * written) when the phones' timer is already on: started meanwhile from
 * another phone.
 */
export function startTimerFromPhone(minutes: number, device?: string): Promise<boolean> {
  return transaction(async (tx) => {
    const cur = await tx.get('timers', PHONE_TIMER);
    if (cur && onWall(cur, currentTime())) return false;
    tx.put('timers', newRun(PHONE_TIMER, newId(), minutes, currentTime(), device));
    return true;
  });
}

/** Stop run `t` from a phone. False when its document has another run now (started since); true once `t` is stopped. */
export function stopTimerFromPhone(t: WallTimer): Promise<boolean> {
  return transaction(async (tx) => {
    const cur = await tx.get('timers', t.id);
    if (cur?.run !== t.run) return false;
    if (stoppedAt(cur) === undefined) tx.patch('timers', t.id, stop(t.run));
    return true;
  });
}

/**
 * The wall's side: scheduled sleep waits until a few minutes after a timer
 * it shows ends, or after it was stopped; and a new run ends Sleep now, so
 * a timer started from a phone shows on the wall. The runs already there
 * when the wall opens do not: they may be older than the Sleep now. Started
 * once the household is open.
 */
export function holdSleepForTimer(): void {
  const seen = new Set(shown.peek().map((t) => t.run));
  effect(() => {
    sleepHeldUntil.value = Math.max(0, ...shown.value.map(timerSleepHold));
    const t = timer.value;
    if (!t || seen.has(t.run)) return;
    seen.add(t.run);
    endForcedSleep();
  });
}
