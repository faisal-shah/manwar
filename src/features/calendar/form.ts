import type { CalEvent, EventDraft } from '../../calendar/types';
import type { HHMM, ISODate, Repeat } from '../../data/types';
import { addDays, dateAt, diffDays, hhmmToMinutes, minutesToHHMM, toISODate } from '../../lib/date';
import { plainText } from './text';

/** Pure event-editor form logic (tests/unit/calendar-form.test.ts). */

/** Editor form state. Times are local wall-clock values from the native inputs. */
export interface Form {
  title: string;
  allDay: boolean;
  startDate: ISODate;
  startTime: HHMM;
  endDate: ISODate;
  endTime: HHMM;
  profiles: string[];
  repeat?: Repeat;
  calendarId: string;
  /** 'default' (calendar's own reminders), 'none', or minutes before as a string. */
  reminder: string;
  /**
   * The reminder as read from the event. While `reminder` still equals it,
   * the event's own reminders are written back untouched (email ones, more
   * than one popup).
   */
  loadedReminder?: string;
  location: string;
  /** Notes as plain text (a Google description may be HTML). */
  notes: string;
  /** The event's own description, written back as it was unless the notes are edited. */
  description?: { raw: string; shown: string };
  countdown: boolean;
}

const hhmm = (d: Date) => minutesToHHMM(d.getHours() * 60 + d.getMinutes());

/** Defaults for a new event: the next half hour today (9 AM on another day), one hour long. */
export function newForm(day: ISODate | undefined, nowMs: number, calendarId: string, countdown = false): Form {
  const now = new Date(nowMs);
  const t = toISODate(now);
  const d = day ?? t;
  let startMin = 9 * 60;
  if (d === t) startMin = Math.min(23 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30);
  const endMin = Math.min(startMin + 60, 23 * 60 + 59);
  return {
    title: '',
    allDay: false,
    startDate: d,
    startTime: minutesToHHMM(startMin),
    endDate: d,
    endTime: minutesToHHMM(endMin),
    profiles: [],
    calendarId,
    reminder: 'none',
    location: '',
    notes: '',
    countdown,
  };
}

export function formFromEvent(ev: CalEvent, profiles: string[], countdown: boolean): Form {
  const lastDay = toISODate(new Date(ev.end.getTime() - 1));
  const reminder =
    ev.reminderMinutes === undefined ? 'default' : ev.reminderMinutes === null ? 'none' : String(ev.reminderMinutes);
  return {
    title: ev.title,
    allDay: ev.allDay,
    startDate: toISODate(ev.start),
    startTime: hhmm(ev.start),
    endDate: ev.allDay ? lastDay : toISODate(ev.end),
    endTime: hhmm(ev.end),
    profiles,
    calendarId: ev.calendarId,
    reminder,
    loadedReminder: reminder,
    location: ev.location ?? '',
    notes: ev.description ? plainText(ev.description) : '',
    description: ev.description ? { raw: ev.description, shown: plainText(ev.description) } : undefined,
    countdown,
  };
}

/** Why the form cannot be saved yet, or null. */
export function formProblem(f: Form): string | null {
  if (!f.title.trim()) return 'Add a title';
  if (!f.profiles.length) return 'Choose who it is for';
  if (!f.calendarId) return 'No calendar to save to';
  if (f.allDay) return f.endDate < f.startDate ? 'The end is before the start' : null;
  return dateAt(f.endDate, f.endTime) <= dateAt(f.startDate, f.startTime) ? 'The end is before the start' : null;
}

export function draftFromForm(f: Form, keepRecurrence: boolean): EventDraft {
  const reminderMinutes = f.reminder === 'default' ? undefined : f.reminder === 'none' ? null : Number(f.reminder);
  const base = {
    title: f.title.trim(),
    allDay: f.allDay,
    repeat: f.repeat,
    keepRecurrence,
    location: f.location.trim() || undefined,
    description: f.description && f.notes === f.description.shown ? f.description.raw : f.notes.trim() || undefined,
    reminderMinutes,
    keepReminders: f.loadedReminder !== undefined && f.reminder === f.loadedReminder,
  };
  if (f.allDay)
    return {
      ...base,
      start: dateAt(f.startDate),
      end: dateAt(addDays(f.endDate, 1)),
      firstDay: f.startDate,
      lastDay: f.endDate,
    };
  return { ...base, start: dateAt(f.startDate, f.startTime), end: dateAt(f.endDate, f.endTime) };
}

/**
 * Switch between all-day and timed. An all-day event read back has no real
 * times (midnight to midnight), so turning it timed starts at 9 AM for an hour
 * on its days instead of offering an empty or inverted range.
 */
export function setAllDay(f: Form, allDay: boolean): Form {
  if (allDay || f.allDay === allDay || f.startTime !== '00:00' || f.endTime !== '00:00') return { ...f, allDay };
  return { ...f, allDay, startTime: '09:00', endTime: '10:00' };
}

/** Same repeat rule (weekday order does not matter). */
export function sameRepeat(a: Repeat | undefined, b: Repeat | undefined): boolean {
  if (!a || !b) return a === b;
  const days = (r: Repeat) => [...(r.weekdays ?? [])].sort().join(',');
  return a.every === b.every && a.unit === b.unit && days(a) === days(b) && (a.until ?? '') === (b.until ?? '');
}

/** Start to end on the clock, in minutes. */
const clockMinutes = (f: Form) => diffDays(f.startDate, f.endDate) * 1440 + hhmmToMinutes(f.endTime) - hhmmToMinutes(f.startTime);

/**
 * Set the end time. An event under a day long stays under a day: the end is
 * the first time it reads after the start, on the start day or the next (so
 * 11 PM to 1 AM ends the next day, and setting the end back to 11:30 PM
 * brings it back). A longer event the parent set up keeps its end day.
 */
export function setEndTime(f: Form, endTime: HHMM): Form {
  if (clockMinutes(f) > 1440) return { ...f, endTime };
  const endDate = hhmmToMinutes(endTime) > hhmmToMinutes(f.startTime) ? f.startDate : addDays(f.startDate, 1);
  return { ...f, endTime, endDate };
}

/** Move the start and keep the duration. */
export function shiftStart(f: Form, startDate: ISODate, startTime: HHMM): Form {
  if (f.allDay) {
    const len = diffDays(f.startDate, f.endDate);
    return { ...f, startDate, startTime, endDate: addDays(startDate, Math.max(0, len)) };
  }
  // On the clock, so a night shift moved off (or onto) the night clocks change keeps its end time.
  const end = hhmmToMinutes(startTime) + Math.max(5, clockMinutes(f));
  return { ...f, startDate, startTime, endDate: addDays(startDate, Math.floor(end / 1440)), endTime: minutesToHHMM(end % 1440) };
}
