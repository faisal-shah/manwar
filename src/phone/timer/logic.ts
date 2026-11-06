import { MAX_MINUTES } from '../../features/timer/logic';

/** The phone's one-tap timers, in minutes. */
export const PRESETS = [5, 10, 15, 20, 30, 45];

/** What the minutes field keeps of what was typed or pasted: digits only, no leading zero, at most three. */
export const minutesField = (raw: string): string =>
  raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, String(MAX_MINUTES).length);
