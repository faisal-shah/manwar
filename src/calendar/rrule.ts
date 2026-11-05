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
