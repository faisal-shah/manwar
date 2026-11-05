import type { CalEvent } from '../../calendar/types';
import type { ISODate } from '../../data/types';
import {
  addDays,
  dateAt,
  dayLong,
  dayShort,
  diffDays,
  formatTime,
  fromISODate,
  monthLong,
  monthShort,
  toISODate,
} from '../../lib/date';
import type { TimeFormat } from '../../lib/date';
import { isLong } from '../../features/calendar/layout';

/**
 * The phone's agenda, pure (tests/unit/phone-agenda.test.ts): the days from
 * a start day, each with its events (all-day ones first), the "Now" line on
 * today, and runs of days with nothing planned folded into one line.
 */

export interface AgendaRow {
  ev: CalEvent;
  /** All day on this day: an all-day event, or a middle day of a longer timed one. Listed first. */
  allDay: boolean;
  /** The time column: when it starts on this day ("11:15 AM", "All day", "Until")... */
  start: string;
  /** ...and when it ends ("11:45 AM", "Thu 1 AM" on another day), null for none. */
  end: string | null;
  /** "Day 2 of 4" on each day of an event over several days. */
  span: string | null;
  /** Over by now. */
  ended: boolean;
  /** A timed event under way now. */
  current: boolean;
}

export type AgendaBlock =
  | {
      kind: 'day';
      day: ISODate;
      rows: AgendaRow[];
      /** Today: the row the Now line goes before (rows.length: after the last), null without timed rows. */
      nowAt: number | null;
    }
  | { kind: 'free'; from: ISODate; to: ISODate };

/** End instant for overlap tests: a zero-length event lasts an instant, so it lands on its start day. */
const endMs = (ev: CalEvent) => Math.max(ev.end.getTime(), ev.start.getTime() + 1);

/** The days [first, last] an event covers (an all-day end is exclusive). */
function coveredDays(ev: CalEvent): { first: ISODate; last: ISODate } {
  return { first: toISODate(ev.start), last: toISODate(new Date(endMs(ev) - 1)) };
}

function row(ev: CalEvent, day: ISODate, now: number, fmt: TimeFormat): AgendaRow {
  const { first, last } = coveredDays(ev);
  const days = diffDays(first, last) + 1;
  const span = days > 1 && (ev.allDay || isLong(ev)) ? `Day ${diffDays(first, day) + 1} of ${days}` : null;
  const ended = endMs(ev) <= now;
  const t = (d: Date) => formatTime(d, fmt);
  const base = { ev, span, ended, current: false };
  if (ev.allDay) return { ...base, allDay: true, start: 'All day', end: null };
  const startsHere = first === day;
  const endsHere = last === day;
  const current = !ended && ev.start.getTime() <= now;
  if (startsHere && endsHere)
    return { ...base, current, allDay: false, start: t(ev.start), end: ev.end > ev.start ? t(ev.end) : null };
  if (startsHere)
    return { ...base, current, allDay: false, start: t(ev.start), end: `${dayShort(ev.end.getDay())} ${t(ev.end)}` };
  if (endsHere) return { ...base, current, allDay: false, start: 'Until', end: t(ev.end) };
  return { ...base, allDay: true, start: 'All day', end: null };
}

/** Where a row starts on its day, for the order of the timed rows. */
const startOn = (r: AgendaRow, dayStart: number) => Math.max(r.ev.start.getTime(), dayStart);

/**
 * The agenda for [from, to] (inclusive). `now` places the Now line and marks
 * what is over; `today` always gets its own day, even with nothing on it.
 */
export function buildAgenda(
  events: readonly CalEvent[],
  from: ISODate,
  to: ISODate,
  now: number,
  fmt: TimeFormat,
  today: ISODate,
): AgendaBlock[] {
  const byDay = new Map<ISODate, CalEvent[]>();
  for (const ev of events) {
    const { first, last } = coveredDays(ev);
    if (last < from || first > to) continue;
    for (let d = first < from ? from : first; d <= last && d <= to; d = addDays(d, 1)) {
      const list = byDay.get(d);
      if (list) list.push(ev);
      else byDay.set(d, [ev]);
    }
  }
  const out: AgendaBlock[] = [];
  let free: { from: ISODate; to: ISODate } | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const evs = byDay.get(d);
    if (!evs && d !== today) {
      if (free) free.to = d;
      else free = { from: d, to: d };
      continue;
    }
    if (free) out.push({ kind: 'free', ...free });
    free = null;
    const dayStart = dateAt(d).getTime();
    const rows = (evs ?? []).map((ev) => row(ev, d, now, fmt));
    rows.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        startOn(a, dayStart) - startOn(b, dayStart) ||
        endMs(a.ev) - endMs(b.ev) ||
        a.ev.title.localeCompare(b.ev.title),
    );
    let nowAt: number | null = null;
    if (d === today && rows.some((r) => !r.allDay)) {
      const next = rows.findIndex((r) => !r.allDay && startOn(r, dayStart) > now);
      nowAt = next < 0 ? rows.length : next;
    }
    out.push({ kind: 'day', day: d, rows, nowAt });
  }
  if (free) out.push({ kind: 'free', ...free });
  return out;
}

/** A day header: "Today", "Tomorrow", "Yesterday" or the weekday, and its date ("Nov 6", "Jan 2, 2027" in another year). */
export function dayTitle(day: ISODate, today: ISODate): { name: string; date: string } {
  const d = fromISODate(day);
  const off = diffDays(today, day);
  const name = off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : off === -1 ? 'Yesterday' : dayLong(d.getDay());
  const year = day.slice(0, 4) === today.slice(0, 4) ? '' : `, ${d.getFullYear()}`;
  return { name, date: `${monthShort(d.getMonth())} ${d.getDate()}${year}` };
}

/** A run of free days: "Thu, Nov 12" or "Thu, Nov 12 - Sun, Nov 15". */
export function freeLabel(from: ISODate, to: ISODate): string {
  const one = (s: ISODate) => {
    const d = fromISODate(s);
    return `${dayShort(d.getDay())}, ${monthShort(d.getMonth())} ${d.getDate()}`;
  };
  return from === to ? one(from) : `${one(from)} - ${one(to)}`;
}

/** The header's title for the day being looked at: "November", or "January 2027" in another year. */
export function monthTitle(day: ISODate, today: ISODate): string {
  const d = fromISODate(day);
  return day.slice(0, 4) === today.slice(0, 4) ? monthLong(d.getMonth()) : `${monthLong(d.getMonth())} ${d.getFullYear()}`;
}
