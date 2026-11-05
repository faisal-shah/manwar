import { MAX_MINUTES, splitRemaining } from '../../features/timer/logic';

/** The phone's one-tap timers, in minutes. */
export const PRESETS = [5, 10, 15, 20, 30, 45];

/** What the minutes field keeps of what was typed or pasted: digits only, no leading zero, at most three. */
export const minutesField = (raw: string): string =>
  raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, String(MAX_MINUTES).length);

/** "4:05" (minutes and seconds left), "1:02:05" past an hour. */
export function clockLeft(ms: number): string {
  const { mins, secs } = splitRemaining(ms);
  const s = String(secs).padStart(2, '0');
  if (mins < 60) return `${mins}:${s}`;
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}:${s}`;
}
