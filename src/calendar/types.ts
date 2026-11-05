import type { ISODate, Repeat } from '../data/types';

export type AccessRole = 'owner' | 'writer' | 'reader' | 'freeBusyReader';

export interface CalendarInfo {
  id: string;
  name: string;
  /** Google's calendar color (hex). */
  color: string;
  accessRole: AccessRole;
  primary: boolean;
}

/** One concrete occurrence, as shown on the wall. */
export interface CalEvent {
  /** eventKey(calendarId, id) */
  key: string;
  calendarId: string;
  /** Google event id (instance id for recurring occurrences). */
  id: string;
  /** Recurring series id, for occurrences of a recurring event. */
  seriesId?: string;
  /**
   * Occurrences: where the series put it (Google's originalStartTime), which
   * differs from `start` when the occurrence was moved. Series edits cut here.
   */
  originalStart?: Date;
  title: string;
  allDay: boolean;
  /** Timed events: instants. All-day events: local midnight of the first day / day after the last day. */
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  /** Organizer email, when it differs from the calendar's own account. */
  organizer?: string;
  /** Can the household account edit this event? */
  editable: boolean;
  /** Minutes-before popup reminder, if the event overrides the calendar default. */
  reminderMinutes?: number | null;
  /** Timed events: the time zones Google keeps the start and end in, when set (edits keep them). */
  timeZone?: string;
  endTimeZone?: string;
}

/** What the editor produces. */
export interface EventDraft {
  title: string;
  allDay: boolean;
  /** Timed: start/end instants. All-day: firstDay..lastDay inclusive. */
  start: Date;
  end: Date;
  firstDay?: ISODate;
  lastDay?: ISODate;
  repeat?: Repeat;
  /** Keep the series' original RRULE lines when the repeat was not edited. */
  keepRecurrence?: boolean;
  location?: string;
  description?: string;
  reminderMinutes?: number | null;
  /**
   * Keep the event's own reminders (the editor's reminder was not changed):
   * an event can carry email and several popup reminders the editor does not show.
   */
  keepReminders?: boolean;
}

export type EditScope = 'this' | 'following' | 'all';

export interface CalendarSource {
  listCalendars(): Promise<CalendarInfo[]>;
  /** Occurrences overlapping [timeMin, timeMax), recurring events expanded. */
  listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<CalEvent[]>;
  /**
   * The first occurrence of an event, a series or one occurrence (by id) that
   * has not ended by `after`; null when there is none. For countdowns beyond
   * the fetched window.
   */
  nextOccurrence(calendarId: string, id: string, after: Date): Promise<CalEvent | null>;
  /** The series' recurrence lines (RRULE/EXDATE), for the editor. */
  seriesRecurrence(calendarId: string, seriesId: string): Promise<string[]>;
  /**
   * Add an event under an id the app chose (newEventId), so a save retried
   * after a lost response updates the event instead of adding it twice.
   */
  insert(calendarId: string, id: string, draft: EventDraft): Promise<void>;
  update(ev: CalEvent, draft: EventDraft, scope: EditScope): Promise<{ newSeriesId?: string }>;
  remove(ev: CalEvent, scope: EditScope): Promise<void>;
}

export const eventKey = (calendarId: string, id: string) => `${calendarId}::${id}`;

/** A new event id in Google's alphabet (base32hex: 0-9, a-v), 26 characters (130 random bits). */
export function newEventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(26));
  return Array.from(bytes, (b) => '0123456789abcdefghijklmnopqrstuv'[b & 31]).join('');
}
