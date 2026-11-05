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
  insert(calendarId: string, draft: EventDraft): Promise<{ id: string }>;
  update(ev: CalEvent, draft: EventDraft, scope: EditScope): Promise<{ newSeriesId?: string }>;
  remove(ev: CalEvent, scope: EditScope): Promise<void>;
}

export const eventKey = (calendarId: string, id: string) => `${calendarId}::${id}`;
