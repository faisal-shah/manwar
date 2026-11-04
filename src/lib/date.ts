import type { HHMM, ISODate, Weekday } from '../data/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of an ISO date. */
export function fromISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Adds months, clamping the day to the target month's length. */
export function addMonths(s: ISODate, n: number): ISODate {
  const d = fromISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toISODate(d);
}

export const daysInMonth = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

export const weekdayOf = (s: ISODate) => fromISODate(s).getDay() as Weekday;

/** Whole days from a to b (b - a), DST-safe. */
export function diffDays(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function monthsBetween(a: ISODate, b: ISODate): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

export function startOfWeek(s: ISODate, weekStart: 0 | 1): ISODate {
  const wd = weekdayOf(s);
  return addDays(s, -((wd - weekStart + 7) % 7));
}

export const startOfMonth = (s: ISODate): ISODate => s.slice(0, 8) + '01';

export function hhmmToMinutes(t: HHMM): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export const minutesToHHMM = (min: number): HHMM => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** The instant of an ISO date at a local time of day. */
export function dateAt(s: ISODate, t: HHMM = '00:00'): Date {
  const d = fromISODate(s);
  const [h, m] = t.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export type TimeFormat = '12h' | '24h';

/** "11:44 AM", "3 PM" (minutes dropped on the hour), or "15:00". */
export function formatTime(d: Date, fmt: TimeFormat, opts: { meridiem?: boolean; dropZeroMinutes?: boolean } = {}): string {
  const h = d.getHours();
  const m = d.getMinutes();
  if (fmt === '24h') return `${pad(h)}:${pad(m)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m === 0 && opts.dropZeroMinutes !== false ? '' : `:${pad(m)}`;
  return opts.meridiem === false ? `${h12}${mm}` : `${h12}${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Skylight-style range: "8 - 9:30 AM", "11:30 AM - 12 PM", "14:00 - 15:30". */
export function formatTimeRange(a: Date, b: Date, fmt: TimeFormat): string {
  if (fmt === '24h') return `${formatTime(a, fmt)} - ${formatTime(b, fmt)}`;
  const sameHalf = a.getHours() < 12 === b.getHours() < 12 && toISODate(a) === toISODate(b);
  return sameHalf
    ? `${formatTime(a, fmt, { meridiem: false })} - ${formatTime(b, fmt)}`
    : `${formatTime(a, fmt)} - ${formatTime(b, fmt)}`;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const dayShort = (wd: number) => DAY_SHORT[wd];
export const dayLong = (wd: number) => DAY_LONG[wd];
export const monthShort = (m0: number) => MONTH_SHORT[m0];
export const monthLong = (m0: number) => MONTH_LONG[m0];

/** "Wed, Nov 4" */
export function formatHeaderDate(s: ISODate): string {
  const d = fromISODate(s);
  return `${DAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "Wednesday, Nov 4" */
export function formatLongDate(s: ISODate): string {
  const d = fromISODate(s);
  return `${DAY_LONG[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "November 2026" */
export function formatMonthYear(s: ISODate): string {
  const d = fromISODate(s);
  return `${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export const isWeekend = (s: ISODate) => {
  const wd = weekdayOf(s);
  return wd === 0 || wd === 6;
};

/** Every ISO date from a to b inclusive. */
export function dateRange(a: ISODate, b: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}
