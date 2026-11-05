/** Wrong PINs in a row before the pad pauses. */
export const PIN_TRIES = 5;
const FIRST_PAUSE_MS = 30_000;
const MAX_PAUSE_MS = 5 * 60_000;

/**
 * How long the PIN pad pauses after `wrong` wrong PINs in a row: nothing
 * until PIN_TRIES, then 30 seconds after every PIN_TRIES misses, doubling
 * each time up to 5 minutes. A kid guessing birthdays gets a few tries; a
 * kid trying all 10,000 PINs gets days.
 */
export function pinPause(wrong: number): number {
  if (wrong < PIN_TRIES || wrong % PIN_TRIES) return 0;
  return Math.min(MAX_PAUSE_MS, FIRST_PAUSE_MS * 2 ** (wrong / PIN_TRIES - 1));
}

/**
 * Whole seconds left in a pause, rounded up: "30 s" for a fresh 30-second
 * pause. `now` must be the exact time (currentTime), not the once-a-second
 * clock signal, which can be most of a second behind when the pause starts.
 */
export const pauseSecondsLeft = (until: number, now: number): number => Math.max(0, Math.ceil((until - now) / 1000));
