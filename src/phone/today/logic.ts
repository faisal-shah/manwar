import type { CalEvent } from '../../calendar/types';
import { isLong } from '../../features/calendar/layout';

/** Pure helpers for the phone's Today tab (no store access, unit-tested). */

export interface DayAgenda {
  /** All-day events and events of a day or longer that touch the day. */
  allDay: CalEvent[];
  /** Timed events still to come or under way (all of them for a day ahead). */
  timed: CalEvent[];
}

export interface NextUp {
  today: DayAgenda;
  /** Tomorrow's events, once no timed event is left today; null before. */
  tomorrow: DayAgenda | null;
}

function split(events: CalEvent[], now: number | null): DayAgenda {
  const allDay = events.filter(isLong);
  const timed = events.filter((ev) => !isLong(ev) && (now === null || ev.end.getTime() > now));
  return { allDay, timed };
}

/**
 * What is next on the calendar. Today: its all-day events and the timed
 * ones not over yet. Once no timed event is left today (the evening, or a
 * day without any), tomorrow's events too, so the screen always says what
 * comes next. `todayEvents` and `tomorrowEvents` are each day's events in
 * display order (all-day first, then by start).
 */
export function nextUp(todayEvents: CalEvent[], tomorrowEvents: CalEvent[], now: number): NextUp {
  const today = split(todayEvents, now);
  return { today, tomorrow: today.timed.length ? null : split(tomorrowEvents, null) };
}

/** Under way at `now` (a timed event that started and has not ended). */
export const isNow = (ev: CalEvent, now: number) => !ev.allDay && ev.start.getTime() <= now && now < ev.end.getTime();

/** Shown items and how many more there are ("+3 more"). */
export function capped<T>(items: T[], max: number): { shown: T[]; more: number } {
  if (items.length <= max) return { shown: items, more: 0 };
  return { shown: items.slice(0, max - 1), more: items.length - (max - 1) };
}
