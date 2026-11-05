import { asleepAt, sleepNowEnd, WAKE_MS } from '../../core/sleep';
import type { DisplayCommand, TimeWindow, WallTimer } from '../../data/types';
import { timerSleepHold } from '../../features/timer/logic';
import { addDays, formatTime, monthShort, toISODate, type TimeFormat } from '../../lib/date';

/**
 * Whether the wall is asleep at `t`, as far as a phone can tell: by the
 * wall's own rule (core/sleep.ts) from what it shares, the last Sleep now or
 * Wake up a phone sent, the timer (which holds scheduled sleep off) and the
 * sleep window. A touch on the wall, or its own Sleep now, is not shared,
 * so this is a guess, said as one.
 */
export function wallAsleepGuess(
  sleep: TimeWindow,
  cmd: DisplayCommand | undefined,
  timer: WallTimer | undefined,
  t: number,
): boolean {
  return asleepAt(
    t,
    {
      wokenUntil: cmd?.kind === 'wake' ? cmd.at + WAKE_MS : 0,
      forcedUntil: cmd?.kind === 'sleep' ? sleepNowEnd(sleep, cmd.at) : 0,
      heldUntil: timerSleepHold(timer),
    },
    sleep,
  );
}

/** "at 9:12 PM", "yesterday at 9:12 PM", "Nov 2 at 9:12 PM": when something was sent, seen from `now`. */
export function whenSent(at: number, now: number, fmt: TimeFormat): string {
  const day = toISODate(new Date(at));
  const time = `at ${formatTime(new Date(at), fmt)}`;
  const today = toISODate(new Date(now));
  if (day === today) return time;
  if (day === addDays(today, -1)) return `yesterday ${time}`;
  return `${monthShort(new Date(at).getMonth())} ${new Date(at).getDate()} ${time}`;
}

/** "Sleep now, asked at 9:12 PM by Mamma's phone." `by` is the sender's name, when known. */
export function describeCommand(cmd: DisplayCommand, now: number, fmt: TimeFormat, by?: string): string {
  const what = cmd.kind === 'sleep' ? 'Sleep now' : 'Wake up';
  return `${what}, asked ${whenSent(cmd.at, now, fmt)}${by ? ` by ${by}` : ''}.`;
}
