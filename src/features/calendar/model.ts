import { computed } from '@preact/signals';
import { calendars, daysOf, eventsBetween, eventColors, metaFor, profilesOf } from '../../calendar/engine';
import type { CalEvent } from '../../calendar/types';
import { profileById, settings } from '../../data/store';
import { nowMs } from '../../lib/clock';
import { EVERYONE, type ISODate, type MealCategory, type MealEntry, type Profile } from '../../data/types';
import {
  addDays,
  dateAt,
  dayShort,
  formatHeaderDate,
  formatLongDate,
  formatTime,
  formatTimeRange,
  toISODate,
} from '../../lib/date';
import { calendarMeals } from '../meals/state';
import { everyoneProfile } from '../../ui/profile';

/** Reactive helpers shared by the views (they read signals, so components re-render on change). */

export interface MealItem {
  key: string;
  meal: MealEntry;
  category: MealCategory;
  day: ISODate;
}

/** Events of a day, or one bar of an all-day row. */
export interface DayItems {
  meals: MealItem[];
  /** All-day events and events of 24 hours or more. */
  long: CalEvent[];
  /** Timed events under 24 hours that touch this day. */
  timed: CalEvent[];
}

const DAY_MS = 86_400_000;

/** All-day events and events of a day or longer go in the all-day row and month bars. */
export const isLong = (ev: CalEvent) => ev.allDay || ev.end.getTime() - ev.start.getTime() >= DAY_MS;

/** Planned meals on a day, for categories shown on the calendar (Filter > Meals). Repeats and per-day exceptions come from the Meals slice. */
export function mealsOn(day: ISODate): MealItem[] {
  if (!settings.value.filter.meals) return [];
  return calendarMeals(day, day).map((m) => ({ key: `${m.entry.id}@${day}`, meal: m.entry, category: m.category, day }));
}

const byStart = (a: CalEvent, b: CalEvent) =>
  a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime() || a.title.localeCompare(b.title);

/** Events and meals for each day of [from, to]. */
export function itemsByDay(from: ISODate, to: ISODate): Map<ISODate, DayItems> {
  const map = new Map<ISODate, DayItems>();
  for (let d = from; d <= to; d = addDays(d, 1)) map.set(d, { meals: mealsOn(d), long: [], timed: [] });
  for (const ev of eventsBetween(from, to)) {
    for (const d of daysOf(ev)) {
      const slot = map.get(d);
      if (!slot) continue;
      if (isLong(ev)) slot.long.push(ev);
      else slot.timed.push(ev);
    }
  }
  for (const v of map.values()) {
    v.long.sort(byStart);
    v.timed.sort(byStart);
  }
  return map;
}

/** All-day first, then timed, each by start. */
export const dayEvents = (d: DayItems) => [...d.long, ...d.timed];

export interface Who {
  id: string;
  profile: Pick<Profile, 'name' | 'color' | 'emoji'>;
}

/** Profiles to show as avatars; empty when unassigned. */
export function whoOf(ev: CalEvent): Who[] {
  const ids = profilesOf(ev);
  if (!ids) return [];
  if (ids.includes(EVERYONE)) return [{ id: EVERYONE, profile: everyoneProfile() }];
  const known = profileById.value;
  return ids.map((id) => ({ id, profile: known.get(id)! }));
}

export const isUnassigned = (ev: CalEvent) => profilesOf(ev) === null;

/**
 * Inline style for an event's fill: the mid tint of its profile color, or
 * diagonal bands (one per profile) for multi-profile events when the setting
 * is on. Tints are mixed against --tint-base so dark mode follows.
 */
export function fillStyle(ev: CalEvent, tint: 'mid' | 'light' = 'mid'): Record<string, string> {
  const colors = eventColors(ev);
  const mix = (c: string) => `color-mix(in srgb, ${c} var(--ev-tint-${tint}), var(--tint-base))`;
  if (colors.length === 1 || !settings.value.stripeMultiProfile) return { '--c': colors[0], background: mix(colors[0]) };
  const n = colors.length;
  const stops = colors.map((c, i) => `${mix(c)} ${((i * 100) / n).toFixed(2)}% ${(((i + 1) * 100) / n).toFixed(2)}%`);
  return { '--c': colors[0], background: `linear-gradient(120deg, ${stops.join(', ')})` };
}

export const calendarName = (id: string) => calendars.value.find((c) => c.id === id)?.name ?? id;

const fmt = () => settings.value.timeFormat;

/** Block and card subtitle: "11:15 - 11:45 AM" or "All day". */
export function timeLabel(ev: CalEvent): string {
  if (ev.allDay) return 'All day';
  const a = toISODate(ev.start);
  const b = toISODate(new Date(ev.end.getTime() - 1));
  if (a !== b)
    return `${dayShort(ev.start.getDay())} ${formatTime(ev.start, fmt())} - ${dayShort(ev.end.getDay())} ${formatTime(ev.end, fmt())}`;
  return formatTimeRange(ev.start, ev.end, fmt());
}

/** Month pill prefix: "11:30 AM", "3 PM"; on the day an overnight event ends, "until 2 AM". */
export const timePrefix = (ev: CalEvent, day?: ISODate) =>
  day && toISODate(ev.start) < day ? `until ${formatTime(ev.end, fmt())}` : formatTime(ev.start, fmt());

/** Detail line: "Wednesday, Nov 4 : 11:15 - 11:45 AM", "Fri, Nov 13 - Mon, Nov 16 : All day". */
export function whenLabel(ev: CalEvent): string {
  const days = daysOf(ev);
  const first = days[0];
  const last = days[days.length - 1];
  if (ev.allDay)
    return first === last ? `${formatLongDate(first)} : All day` : `${formatHeaderDate(first)} - ${formatHeaderDate(last)}`;
  if (first === last) return `${formatLongDate(first)} : ${timeLabel(ev)}`;
  return `${formatHeaderDate(first)}, ${formatTime(ev.start, fmt())} - ${formatHeaderDate(last)}, ${formatTime(ev.end, fmt())}`;
}

/** Reminder line for the detail popover. */
export function reminderLabel(minutes: number | null | undefined): string | null {
  if (minutes === undefined) return null;
  if (minutes === null) return 'No reminder';
  if (minutes === 0) return 'At time of event';
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'day' : 'days'} before`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'} before`;
  return `${minutes} minutes before`;
}

/** The clock at minute resolution: views that only need minutes re-render once a minute, not every second. */
export const nowMinute = computed(() => Math.floor(nowMs.value / 60_000) * 60_000);

/** Has the event ended? (Dim past events.) */
export const isPast = (ev: CalEvent) => settings.value.dimPast && ev.end.getTime() <= nowMinute.value;

/** Emoji for a countdown: the one set on the event, else a guess from the title. */
export function countdownEmoji(ev: CalEvent): string | undefined {
  const set = metaFor(ev)?.emoji;
  if (set) return set;
  const t = ev.title.toLowerCase();
  const guesses: [RegExp, string][] = [
    [/birthday|bday/, '🎂'],
    [/camp/, '🏕️'],
    [/trip|vacation|holiday|flight/, '✈️'],
    [/wedding|anniversary/, '💍'],
    [/christmas/, '🎄'],
    [/thanksgiving/, '🦃'],
    [/eid|ramadan/, '🌙'],
    [/party/, '🎉'],
    [/school/, '🏫'],
    [/visit/, '🏡'],
  ];
  return guesses.find(([re]) => re.test(t))?.[1];
}

/** Minutes after midnight on `day` where a timed segment starts and ends (clipped to the day). */
export function segmentOn(ev: CalEvent, day: ISODate): { startMin: number; endMin: number } {
  const dayStart = dateAt(day).getTime();
  const dayEnd = dateAt(addDays(day, 1)).getTime();
  const s = Math.max(ev.start.getTime(), dayStart);
  const e = Math.min(ev.end.getTime(), dayEnd);
  // Minutes from local midnight, DST-safe by using wall-clock fields.
  const toMin = (t: number, isEnd: boolean) => {
    if (isEnd && t >= dayEnd) return 24 * 60;
    const d = new Date(t);
    return toISODate(d) === day ? d.getHours() * 60 + d.getMinutes() : 0;
  };
  return { startMin: toMin(s, false), endMin: toMin(e, true) };
}
