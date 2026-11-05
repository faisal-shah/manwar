import type { ISODate, Repeat, Weekday } from '../data/types';
import { addDays, toISODate } from '../lib/date';

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQ: Record<Repeat['unit'], string> = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' };
const UNIT: Record<string, Repeat['unit']> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' };

const pad = (n: number) => String(n).padStart(2, '0');

const utcStamp = (t: Date) =>
  `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}Z`;

/** UNTIL value: a date for all-day series, the end of that local day in UTC for timed ones. */
function untilValue(until: ISODate, allDay: boolean): string {
  if (allDay) return until.replace(/-/g, '');
  const [y, m, d] = until.split('-').map(Number);
  return utcStamp(new Date(y, m - 1, d, 23, 59, 59));
}

export function toRRule(r: Repeat, allDay: boolean): string {
  const parts = [`FREQ=${FREQ[r.unit]}`];
  if (r.every > 1) parts.push(`INTERVAL=${r.every}`);
  if (r.unit === 'week' && r.weekdays?.length)
    parts.push(
      `BYDAY=${[...r.weekdays]
        .sort()
        .map((d) => DAYS[d])
        .join(',')}`,
    );
  if (r.until) parts.push(`UNTIL=${untilValue(r.until, allDay)}`);
  return `RRULE:${parts.join(';')}`;
}

/**
 * Parse the RRULE line of a recurrence into a Repeat. Returns null for rules
 * the editor cannot represent (COUNT, BYMONTHDAY lists, BYSETPOS, ...); the
 * editor then shows the rule read-only and keeps it unchanged.
 */
export function fromRecurrence(lines: string[]): Repeat | null {
  const line = lines.find((l) => l.startsWith('RRULE:'));
  if (!line) return null;
  const kv = Object.fromEntries(
    line
      .slice(6)
      .split(';')
      .map((p) => p.split('=') as [string, string]),
  );
  const unit = UNIT[kv.FREQ];
  if (!unit) return null;
  const supported = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'WKST']);
  if (Object.keys(kv).some((k) => !supported.has(k))) return null;
  const r: Repeat = { every: kv.INTERVAL ? Number(kv.INTERVAL) : 1, unit };
  if (kv.BYDAY) {
    if (unit !== 'week') return null;
    const days = kv.BYDAY.split(',').map((d: string) => DAYS.indexOf(d));
    if (days.some((d: number) => d < 0)) return null;
    r.weekdays = days as Weekday[];
  }
  if (kv.UNTIL) {
    const u: string = kv.UNTIL;
    if (u.length === 8) r.until = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
    else {
      const utc = new Date(
        Date.UTC(+u.slice(0, 4), +u.slice(4, 6) - 1, +u.slice(6, 8), +u.slice(9, 11), +u.slice(11, 13), +u.slice(13, 15)),
      );
      r.until = toISODate(utc);
    }
  }
  return r;
}

const rruleParts = (line: string) => line.slice(6).split(';');

/** The RRULE's COUNT, or null when it has none. */
export function recurrenceCount(lines: string[]): number | null {
  const line = lines.find((l) => l.startsWith('RRULE:'));
  const count = line && rruleParts(line).find((p) => p.startsWith('COUNT='));
  return count ? Number(count.slice(6)) : null;
}

/** The same recurrence with the RRULE's COUNT replaced. */
export function withCount(lines: string[], count: number): string[] {
  return lines.map((l) =>
    l.startsWith('RRULE:')
      ? `RRULE:${rruleParts(l)
          .map((p) => (p.startsWith('COUNT=') ? `COUNT=${count}` : p))
          .join(';')}`
      : l,
  );
}

/**
 * How far a series' start moved: by wall-clock time on the tablet (timed:
 * a day later is a day later across a clock change, not 23 or 25 hours) or
 * by whole days (all-day).
 */
export type SeriesShift = { wallMs: number } | { days: number };

/** A local time's wall clock as a number (its fields read as UTC), so a wall-clock shift is a sum. */
export const wallOf = (d: Date) =>
  Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

/** The local time whose wall clock is `wall`. */
export function fromWall(wall: number): Date {
  const u = new Date(wall);
  return new Date(
    u.getUTCFullYear(),
    u.getUTCMonth(),
    u.getUTCDate(),
    u.getUTCHours(),
    u.getUTCMinutes(),
    u.getUTCSeconds(),
    u.getUTCMilliseconds(),
  );
}

/**
 * The EXDATE lines moved with a series whose start moved, so occurrences
 * deleted on other clients stay deleted: a local value (TZID or floating)
 * moves its wall-clock fields, a UTC one the local time it names, a date by
 * whole days. Values of the other kind (a date on a timed series) are left
 * as they are.
 */
export function shiftExdates(lines: string[], by: SeriesShift): string[] {
  return lines.map((l) => {
    if (!l.startsWith('EXDATE')) return l;
    const at = l.indexOf(':');
    const values = l.slice(at + 1).split(',');
    return `${l.slice(0, at)}:${values.map((v) => shiftValue(v.trim(), by)).join(',')}`;
  });
}

function shiftValue(v: string, by: SeriesShift): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(v);
  if (!m) return v;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return 'days' in by ? addDays(`${y}-${mo}-${d}`, by.days).replace(/-/g, '') : v;
  if (!('wallMs' in by)) return v;
  const fields = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  // A UTC value is an instant: the occurrence the series had at that local time, moved on the wall clock.
  if (z) return utcStamp(fromWall(wallOf(new Date(fields)) + by.wallMs));
  // A local value's fields are its wall clock (read as UTC, so the shift is a sum).
  return utcStamp(new Date(fields + by.wallMs)).slice(0, -1);
}

/**
 * End a series just before one of its occurrences, given where the series
 * put that occurrence (its original start): an all-day series the day
 * before, a timed one a second before (UNTIL is inclusive). A timed cut is
 * an instant, so it holds whatever time zone the series repeats in.
 */
export function endSeriesBefore(lines: string[], before: Date, allDay: boolean): string[] {
  const until = allDay ? untilValue(addDays(toISODate(before), -1), true) : utcStamp(new Date(before.getTime() - 1000));
  return lines.map((l) => {
    if (!l.startsWith('RRULE:')) return l;
    const parts = l
      .slice(6)
      .split(';')
      .filter((p) => !p.startsWith('UNTIL=') && !p.startsWith('COUNT='));
    parts.push(`UNTIL=${until}`);
    return `RRULE:${parts.join(';')}`;
  });
}
