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

/** A DATE or DATE-TIME value (RFC 5545): its fields, and whether it is in UTC. */
const VALUE = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/;

/** The day a date or date-time value names: its own date, or a UTC one's day on the tablet's clock. */
function dayOf(v: string): ISODate {
  const [, y, mo, d, h, mi, s, z] = VALUE.exec(v)!;
  if (h === undefined || !z) return `${y}-${mo}-${d}`;
  return toISODate(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)));
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
    if (!VALUE.test(kv.UNTIL)) return null;
    r.until = dayOf(kv.UNTIL);
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
 * A weekly RRULE moved by `days` (an occurrence moved to another weekday,
 * applied to the series): its BYDAY weekdays move with it, or the series
 * would keep repeating on the old days. Other rules follow their start.
 */
export function shiftByday(lines: string[], days: number): string[] {
  const by = ((days % 7) + 7) % 7;
  if (!by) return lines;
  return lines.map((l) => {
    if (!l.startsWith('RRULE:')) return l;
    const parts = rruleParts(l);
    if (!parts.includes('FREQ=WEEKLY')) return l;
    const i = parts.findIndex((p) => p.startsWith('BYDAY='));
    if (i < 0) return l;
    const codes = parts[i].slice(6).split(',');
    if (codes.some((c) => !DAYS.includes(c))) return l;
    const moved = codes.map((c) => (DAYS.indexOf(c) + by) % 7).sort((a, b) => a - b);
    parts[i] = `BYDAY=${moved.map((d) => DAYS[d]).join(',')}`;
    return `RRULE:${parts.join(';')}`;
  });
}

/**
 * A series' recurrence after its start moved by `by` (`days`: the series is
 * all-day now, `wallMs`: timed), from a series that was all-day or timed
 * (`wasAllDay`). Its EXDATE lines move with it, so occurrences deleted on
 * other clients stay deleted: a local value (TZID or floating) moves its
 * wall-clock fields, a UTC one the local time it names, a date by whole
 * days. A series changed between all-day and timed takes its EXDATEs and
 * the RRULE's UNTIL into its new kind, as Google requires (an EXDATE must
 * name an occurrence, so a date on an all-day series and a date-time on a
 * timed one; RFC 5545 gives UNTIL the kind of the start): a date-time
 * becomes its day, a date becomes that day at the new time (`wallMs` from
 * the old midnight) in UTC. Values of the other kind than the series had
 * are left as they are.
 */
export function moveRecurrence(lines: string[], by: SeriesShift, wasAllDay: boolean): string[] {
  const allDay = 'days' in by;
  return lines.map((l) => {
    if (l.startsWith('RRULE:')) return allDay === wasAllDay ? l : untilIn(l, allDay);
    if (!l.startsWith('EXDATE')) return l;
    const at = l.indexOf(':');
    const values = l
      .slice(at + 1)
      .split(',')
      .map((v) => v.trim());
    if (/^\d{8}$/.test(values[0]) !== wasAllDay) return l;
    // Into the other kind with its parameters: VALUE=DATE, or none for UTC times (a TZID is for local ones).
    const head = allDay === wasAllDay ? l.slice(0, at) : allDay ? 'EXDATE;VALUE=DATE' : 'EXDATE';
    return `${head}:${values.map((v) => shiftValue(v, by)).join(',')}`;
  });
}

function shiftValue(v: string, by: SeriesShift): string {
  const m = VALUE.exec(v);
  if (!m) return v;
  const [, y, mo, d, h, mi, s, z] = m;
  if ('days' in by) return addDays(dayOf(v), by.days).replace(/-/g, '');
  // A date: that day's midnight on the wall clock, moved to the series' time of day.
  if (h === undefined) return utcStamp(fromWall(Date.UTC(+y, +mo - 1, +d) + by.wallMs));
  const fields = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  // A UTC value is an instant: the occurrence the series had at that local time, moved on the wall clock.
  if (z) return utcStamp(fromWall(wallOf(new Date(fields)) + by.wallMs));
  // A local value's fields are its wall clock (read as UTC, so the shift is a sum).
  return utcStamp(new Date(fields + by.wallMs)).slice(0, -1);
}

/** An RRULE line with an UNTIL of the other kind written in this one (the same last day). */
function untilIn(line: string, allDay: boolean): string {
  const parts = rruleParts(line).map((p) => {
    const u = p.slice(6);
    return p.startsWith('UNTIL=') && VALUE.test(u) && (u.length === 8) !== allDay ? `UNTIL=${untilValue(dayOf(u), allDay)}` : p;
  });
  return `RRULE:${parts.join(';')}`;
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
