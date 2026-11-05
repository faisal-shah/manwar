import type { CalendarView, ISODate } from '../../data/types';
import {
  addDays,
  addMonths,
  dateAt,
  diffDays,
  formatHeaderDate,
  formatMonthYear,
  fromISODate,
  daysInMonth,
  monthLong,
  monthShort,
  startOfMonth,
  startOfWeek,
  toISODate,
} from '../../lib/date';

/**
 * Pure layout and navigation rules for the calendar views. No signals or DOM
 * here, so everything is unit-tested (tests/unit/calendar-layout.test.ts).
 */

/* ---------- Periods and paging ---------- */

export interface NavSettings {
  weekStart: 0 | 1;
  scheduleDays: number;
  scheduleStartToday: boolean;
  weekStartToday: boolean;
  monthStartCurrentWeek: boolean;
}

export interface Period {
  /** First and last day shown (inclusive). */
  from: ISODate;
  to: ISODate;
  /** Month view: the month being shown (first of the month). */
  month?: ISODate;
}

/**
 * The days a view shows. `focus` is null while the view follows today;
 * otherwise it is the period's start (Schedule, Week, Day) or any day of the
 * month (Month).
 */
export function viewPeriod(view: CalendarView, focus: ISODate | null, today: ISODate, s: NavSettings): Period {
  switch (view) {
    case 'schedule': {
      const n = Math.min(7, Math.max(1, Math.round(s.scheduleDays)));
      const from = focus ?? scheduleHome(today, n, s);
      return { from, to: addDays(from, n - 1) };
    }
    case 'day': {
      const d = focus ?? today;
      return { from: d, to: d };
    }
    case 'week': {
      const from = s.weekStartToday ? (focus ?? today) : startOfWeek(focus ?? today, s.weekStart);
      return { from, to: addDays(from, 6) };
    }
    case 'month': {
      const month = startOfMonth(focus ?? today);
      const current = month === startOfMonth(today);
      if (current && s.monthStartCurrentWeek) {
        const from = startOfWeek(today, s.weekStart);
        return { from, to: addDays(from, 5 * 7 - 1), month };
      }
      const from = startOfWeek(month, s.weekStart);
      const d = fromISODate(month);
      const last = addDays(month, daysInMonth(d.getFullYear(), d.getMonth()) - 1);
      const weeks = Math.ceil((diffDays(from, last) + 1) / 7);
      return { from, to: addDays(from, weeks * 7 - 1), month };
    }
  }
}

/**
 * First day of the Schedule while it follows today: today, or the week
 * start. Fewer than 7 days from the week start may end before today (4 days
 * from Monday on a Saturday), so then the days run up to today instead.
 */
function scheduleHome(today: ISODate, n: number, s: NavSettings): ISODate {
  if (s.scheduleStartToday) return today;
  const weekStart = startOfWeek(today, s.weekStart);
  const latest = addDays(today, -(n - 1));
  return latest > weekStart ? latest : weekStart;
}

/** The focus one period earlier (-1) or later (+1); null when that lands back on today's period. */
export function pageFocus(
  view: CalendarView,
  focus: ISODate | null,
  today: ISODate,
  s: NavSettings,
  dir: -1 | 1,
): ISODate | null {
  const p = viewPeriod(view, focus, today, s);
  let next: ISODate;
  switch (view) {
    case 'schedule':
      next = addDays(p.from, dir * (diffDays(p.from, p.to) + 1));
      break;
    case 'day':
      next = addDays(p.from, dir);
      break;
    case 'week':
      next = addDays(p.from, dir * 7);
      break;
    case 'month':
      next = addMonths(p.month!, dir);
      break;
  }
  const home = viewPeriod(view, null, today, s);
  const cand = viewPeriod(view, next, today, s);
  return cand.from === home.from && cand.to === home.to ? null : next;
}

/** Keep roughly the same place in time when switching views. */
export function focusForView(
  from: CalendarView,
  to: CalendarView,
  focus: ISODate | null,
  today: ISODate,
  s: NavSettings,
): ISODate | null {
  if (focus === null) return null;
  const p = viewPeriod(from, focus, today, s);
  const day = p.from <= today && today <= p.to ? today : from === 'month' ? p.month! : p.from;
  const home = viewPeriod(to, null, today, s);
  if (home.from <= day && day <= home.to) return null;
  if (to === 'schedule' || to === 'day') return day;
  if (to === 'week') return s.weekStartToday ? day : startOfWeek(day, s.weekStart);
  return startOfMonth(day);
}

export const periodHasToday = (p: Period, today: ISODate) => p.from <= today && today <= p.to;

/**
 * Top-bar title when paged away from today: "November 2026",
 * "Nov - Dec 2026", "Dec 2026 - Jan 2027", or "Fri, Nov 6, 2026" in Day view.
 * Null while the period contains today (the bar then shows the date).
 */
export function periodTitle(view: CalendarView, p: Period, today: ISODate): string | null {
  if (view === 'month') return p.month === startOfMonth(today) ? null : formatMonthYear(p.month!);
  if (periodHasToday(p, today)) return null;
  if (view === 'day') return `${formatHeaderDate(p.from)}, ${p.from.slice(0, 4)}`;
  return monthSpan(p.from, p.to);
}

export function monthSpan(from: ISODate, to: ISODate): string {
  const a = fromISODate(from);
  const b = fromISODate(to);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return formatMonthYear(from);
  if (a.getFullYear() === b.getFullYear()) return `${monthShort(a.getMonth())} - ${monthShort(b.getMonth())} ${a.getFullYear()}`;
  return `${monthShort(a.getMonth())} ${a.getFullYear()} - ${monthShort(b.getMonth())} ${b.getFullYear()}`;
}

/** "November 8 - 14", "November 29 - December 5" (Week view's Next Week cell). */
export function rangeLabel(from: ISODate, to: ISODate): string {
  const a = fromISODate(from);
  const b = fromISODate(to);
  const left = `${monthLong(a.getMonth())} ${a.getDate()}`;
  return a.getMonth() === b.getMonth() ? `${left} - ${b.getDate()}` : `${left} - ${monthLong(b.getMonth())} ${b.getDate()}`;
}

/** "No events", "1 event", "4 events", "12 events today". */
export function countLabel(n: number, isToday: boolean): string {
  if (n === 0) return 'No events';
  return `${n} ${n === 1 ? 'event' : 'events'}${isToday ? ' today' : ''}`;
}

/* ---------- Time grid lanes ---------- */

export interface Laned<T> {
  item: T;
  /** Zero-based lane within its overlap cluster. */
  lane: number;
  /** Lanes in the cluster; the column is split evenly between them. */
  lanes: number;
}

/**
 * Side-by-side lanes for overlapping timed events. Events that overlap
 * (directly or through a chain) form a cluster; each takes the first lane
 * free at its start, and every member of a cluster shares the cluster's lane
 * count, so widths stay even as on the Skylight grid.
 */
export function layoutLanes<T>(items: T[], start: (t: T) => number, end: (t: T) => number): Laned<T>[] {
  const sorted = [...items].sort((a, b) => start(a) - start(b) || end(b) - end(a));
  const out: Laned<T>[] = [];
  let cluster: Laned<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    for (const c of cluster) c.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    const s = start(item);
    const e = Math.max(end(item), s + 1);
    if (s >= clusterEnd) close();
    let lane = laneEnds.findIndex((le) => le <= s);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else laneEnds[lane] = e;
    const placed = { item, lane, lanes: 1 };
    cluster.push(placed);
    out.push(placed);
    clusterEnd = Math.max(clusterEnd === -Infinity ? e : clusterEnd, e);
  }
  close();
  return out;
}

/* ---------- Bars (all-day row, month weeks) ---------- */

export interface Span {
  /** First and last column covered, inclusive. */
  from: number;
  to: number;
}

/** First-fit rows for horizontal bars, in the order given. */
export function packRows(spans: Span[]): number[] {
  const rows: Span[][] = [];
  return spans.map((s) => {
    let r = rows.findIndex((row) => row.every((o) => o.to < s.from || o.from > s.to));
    if (r < 0) {
      r = rows.length;
      rows.push([]);
    }
    rows[r].push(s);
    return r;
  });
}

export interface WeekBar extends Span {
  id: string;
  /** The bar continues from the previous week / into the next week. */
  contStart?: boolean;
  contEnd?: boolean;
}

export interface MonthWeekLayout {
  bars: { id: string; col0: number; col1: number; line: number; startsHere: boolean; endsHere: boolean }[];
  singles: { id: string; col: number; line: number }[];
  more: { col: number; line: number; count: number }[];
}

/**
 * One week row of the Month grid. Multi-day bars keep one line across the
 * days they cover; single-day items fill the free lines of their day. A day
 * shows at most `maxLines` items; with more, it shows `maxLines - 1` and an
 * "N more" line (Skylight: 3 items, or 2 plus "N more").
 */
export function layoutMonthWeek(bars: WeekBar[], singles: string[][], maxLines = 3): MonthWeekLayout {
  const order = bars
    .map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.from - y.b.from || y.b.to - y.b.from - (x.b.to - x.b.from) || x.i - y.i);
  const slotOf = new Map<WeekBar, number>();
  packRows(order.map((o) => o.b)).forEach((slot, k) => slotOf.set(order[k].b, slot));

  const out: MonthWeekLayout = { bars: [], singles: [], more: [] };
  const limitByCol: number[] = [];
  for (let col = 0; col < 7; col++) {
    const taken = new Set(bars.filter((b) => b.from <= col && col <= b.to).map((b) => slotOf.get(b)!));
    const items = singles[col] ?? [];
    const place = (limit: number) => {
      const lines: number[] = [];
      for (let line = 0; lines.length < items.length && line < limit; line++) if (!taken.has(line)) lines.push(line);
      return lines;
    };
    const all = place(Infinity);
    const needed = Math.max(taken.size ? Math.max(...taken) + 1 : 0, all.length ? all[all.length - 1] + 1 : 0);
    if (needed <= maxLines) {
      limitByCol[col] = maxLines;
      all.forEach((line, k) => out.singles.push({ id: items[k], col, line }));
      continue;
    }
    const limit = maxLines - 1;
    limitByCol[col] = limit;
    const shown = place(limit);
    shown.forEach((line, k) => out.singles.push({ id: items[k], col, line }));
    const hiddenBars = [...taken].filter((s) => s >= limit).length;
    out.more.push({ col, line: limit, count: hiddenBars + items.length - shown.length });
  }
  for (const b of bars) {
    const slot = slotOf.get(b)!;
    let runStart = -1;
    for (let col = b.from; col <= b.to + 1; col++) {
      const visible = col <= b.to && slot < limitByCol[col];
      if (visible && runStart < 0) runStart = col;
      if (!visible && runStart >= 0) {
        out.bars.push({
          id: b.id,
          col0: runStart,
          col1: col - 1,
          line: slot,
          startsHere: runStart === b.from && !b.contStart,
          endsHere: col - 1 === b.to && !b.contEnd,
        });
        runStart = -1;
      }
    }
  }
  return out;
}

/* ---------- Mini month ---------- */

/**
 * All-day events and events of a day or longer go in the all-day row and
 * month bars. A day is a day on the clock: midnight to midnight on the day
 * clocks go forward is 23 hours and still a whole day (other calendars send
 * all-day events that way).
 */
export function isLong(ev: { allDay: boolean; start: Date; end: Date }): boolean {
  if (ev.allDay) return true;
  const dayLater = new Date(ev.start);
  dayLater.setDate(dayLater.getDate() + 1);
  return ev.end >= dayLater;
}

/**
 * Minutes after midnight on `day` where a timed segment starts and ends
 * (clipped to the day), from the wall clock so the hours line up across
 * DST. On the night clocks go back, an event that starts in the first pass
 * of the repeated hour and ends in the second reads as ending before it
 * started (1:30 AM for 45 minutes ends at 1:15 AM); it is drawn from its
 * start for as long as it lasts instead of as a sliver.
 */
export function segmentOn(ev: { start: Date; end: Date }, day: ISODate): { startMin: number; endMin: number } {
  const dayStart = dateAt(day).getTime();
  const dayEnd = dateAt(addDays(day, 1)).getTime();
  const s = Math.max(ev.start.getTime(), dayStart);
  const e = Math.min(ev.end.getTime(), dayEnd);
  const toMin = (t: number, isEnd: boolean) => {
    if (isEnd && t >= dayEnd) return 24 * 60;
    const d = new Date(t);
    return toISODate(d) === day ? d.getHours() * 60 + d.getMinutes() : 0;
  };
  const startMin = toMin(s, false);
  const endMin = toMin(e, true);
  const lasts = Math.round((e - s) / 60_000);
  return { startMin, endMin: endMin <= startMin && lasts > 0 ? Math.min(24 * 60, startMin + lasts) : endMin };
}

/** The 6 weeks (42 days) of a mini month, leading and trailing days included. */
export function miniMonthDays(month: ISODate, weekStart: 0 | 1): ISODate[] {
  const from = startOfWeek(startOfMonth(month), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(from, i));
}
