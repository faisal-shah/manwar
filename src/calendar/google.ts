import { dropGoogleToken, googleAccessToken } from '../data/session';
import { addDays, diffDays, fromISODate, toISODate } from '../lib/date';
import { endSeriesBefore, fromWall, recurrenceCount, shiftExdates, toRRule, wallOf, withCount, type SeriesShift } from './rrule';
import {
  RateLimited,
  eventKey,
  type AccessRole,
  type CalEvent,
  type CalendarInfo,
  type CalendarSource,
  type EventDraft,
} from './types';

const API = 'https://www.googleapis.com/calendar/v3';

class GoogleError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * A request Google has not answered in this long is given up. A connection
 * that died without closing (the Wi-Fi dropped mid-request) otherwise holds
 * its sync, and every sync queued behind it, for as long as the network
 * stack takes to notice.
 */
const REQUEST_TIMEOUT_MS = 30_000;

async function request(url: URL, init: RequestInit, token: string): Promise<{ res: Response; body: any }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
    // A body that is not JSON (a proxy's error page) is no body; one cut off by the timeout is a timeout.
    const body =
      res.status === 204
        ? null
        : await res.json().catch((e) => {
            if (ctl.signal.aborted) throw e;
            return null;
          });
    return { res, body };
  } catch (e) {
    throw ctl.signal.aborted ? new Error('Google Calendar did not answer in time.') : e;
  } finally {
    clearTimeout(timer);
  }
}

/** Reasons Google gives a 403 that means "slow down" rather than "no access" (a 429 always means it). */
const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

function isRateLimit(status: number, body: any): boolean {
  if (status === 429) return true;
  const errors = body?.error?.errors;
  return status === 403 && Array.isArray(errors) && errors.some((e) => RATE_REASONS.has(e?.reason));
}

/** The wait a Retry-After header names (seconds or an HTTP date), when the response has a readable one. */
function retryAfterMs(res: Response): number | null {
  const v = res.headers.get('Retry-After')?.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/**
 * Rate limits on a request a person waits for (a save, the editor's repeat
 * rule): retried after these waits plus up to a second of jitter, as Google
 * asks (exponential backoff), or after Retry-After when it names one. A wait
 * longer than MAX_WAIT_MS is not sat out: the save fails at once and says
 * when to try again.
 */
const RATE_WAITS_MS = [1000, 2000];
const MAX_WAIT_MS = 5000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rateLimited(after: number | null): RateLimited {
  const when = after === null || after <= 60_000 ? 'in a minute' : `in ${Math.ceil(after / 60_000)} minutes`;
  return new RateLimited(`Google Calendar is busy. Try again ${when}.`, after);
}

type CallInit = RequestInit & {
  query?: Record<string, string>;
  /** A read of the background sync: a rate limit fails it at once, and the engine pauses the sync. */
  background?: boolean;
};

/** Google Calendar API boundary: every response is validated here. */
async function call<T>(path: string, init: CallInit = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  let renewed = false;
  let limited = 0;
  for (;;) {
    const token = await googleAccessToken();
    const { res, body } = await request(url, init, token);
    // A token Google no longer takes (expired early by the tablet's clock, or revoked): ask for a new one, once.
    if (res.status === 401 && !renewed) {
      renewed = true;
      dropGoogleToken(token);
      continue;
    }
    if (isRateLimit(res.status, body)) {
      const after = retryAfterMs(res);
      const pause = after ?? RATE_WAITS_MS[limited];
      if (init.background || limited >= RATE_WAITS_MS.length || pause > MAX_WAIT_MS) throw rateLimited(after);
      limited++;
      await wait(pause + Math.random() * 1000);
      continue;
    }
    if (!res.ok) throw new GoogleError(res.status, `Google Calendar ${res.status}: ${body?.error?.message ?? res.statusText}`);
    if (res.status === 204) return undefined as T;
    // A success that is not JSON (a captive portal's page) is not data.
    if (body === null) throw new GoogleError(res.status, 'Google Calendar sent a response that could not be read.');
    return body as T;
  }
}

/** DELETE that treats an event already gone (deleted on a phone meanwhile) as done. */
async function del(path: string): Promise<void> {
  try {
    await call(path, { method: 'DELETE' });
  } catch (e) {
    if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}

interface GTime {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
}
interface GEvent {
  id: string;
  status?: string;
  eventType?: string;
  summary?: string;
  description?: string;
  location?: string;
  visibility?: string;
  locked?: boolean;
  start: GTime;
  end: GTime;
  recurringEventId?: string;
  recurrence?: string[];
  organizer?: { email?: string; self?: boolean };
  attendees?: { email?: string; self?: boolean; responseStatus?: string }[];
  guestsCanModify?: boolean;
  reminders?: { useDefault?: boolean; overrides?: { method: string; minutes: number }[] };
  originalStartTime?: GTime;
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function parseTime(t: GTime): { at: Date; allDay: boolean } {
  if (t.date) return { at: fromISODate(t.date), allDay: true };
  if (t.dateTime) return { at: new Date(t.dateTime), allDay: false };
  throw new Error('Google Calendar: event without a start/end time');
}

/**
 * Event types that are not family events: the working location (Home,
 * Office) Google shows as a chip over a work day, and work focus blocks.
 * Out of office, birthdays and events Gmail added (flights, bookings) stay.
 */
const OFF_WALL_TYPES = new Set(['workingLocation', 'focusTime']);

/** Is the event on the household's schedule? Not cancelled stubs, the types above, or invitations it declined. */
function onWall(g: GEvent): boolean {
  if (g.status === 'cancelled' || !g.start || !g.end) return false;
  if (g.eventType && OFF_WALL_TYPES.has(g.eventType)) return false;
  return !g.attendees?.some((a) => a.self && a.responseStatus === 'declined');
}

/** Types whose times and text the API does not let anyone change (birthdays, events from Gmail). */
const FIXED_TYPES = new Set(['birthday', 'fromGmail']);

function toCalEvent(calendarId: string, g: GEvent, role: AccessRole): CalEvent {
  const s = parseTime(g.start);
  const e = parseTime(g.end);
  const popup =
    g.reminders?.useDefault === false ? (g.reminders.overrides?.find((o) => o.method === 'popup')?.minutes ?? null) : undefined;
  // Free/busy access, and private events on a calendar shared read-only, come without their details.
  const detailsHidden = role === 'freeBusyReader' || (role === 'reader' && g.visibility === 'private');
  const fixed = !!g.eventType && FIXED_TYPES.has(g.eventType);
  return {
    key: eventKey(calendarId, g.id),
    calendarId,
    id: g.id,
    seriesId: g.recurringEventId,
    originalStart: g.originalStartTime ? parseTime(g.originalStartTime).at : undefined,
    title: g.summary?.trim() || (detailsHidden ? 'Busy' : '(No title)'),
    allDay: s.allDay,
    start: s.at,
    end: e.at,
    location: g.location || undefined,
    description: g.description || undefined,
    // Gmail adds its events under a placeholder organizer, not someone who invited the family.
    organizer: g.organizer && !g.organizer.self && g.eventType !== 'fromGmail' ? g.organizer.email : undefined,
    editable:
      (role === 'owner' || role === 'writer') &&
      !fixed &&
      g.locked !== true &&
      (!g.organizer || g.organizer.self === true || g.guestsCanModify === true),
    reminderMinutes: popup,
    timeZone: g.start.timeZone || undefined,
    endTimeZone: g.end.timeZone || undefined,
  };
}

/** Time zones to write with a timed start and end. */
interface Zones {
  start: string;
  end: string;
}

/**
 * Zones for a change to an event: a timed one keeps its own (a weekly call
 * set in London time keeps following London's clock changes, a flight keeps
 * its arrival zone); an all-day one, or one without a zone, takes the
 * tablet's. Always written, since a recurrence needs one.
 */
function zonesOf(wasAllDay: boolean, start?: string | null, end?: string | null): Zones {
  const tablet = zone();
  if (wasAllDay) return { start: tablet, end: tablet };
  return { start: start || tablet, end: end || start || tablet };
}

function draftBody(d: EventDraft, zones: Zones): Partial<GEvent> {
  const timed = (at: Date, timeZone: string): GTime => ({ date: null, dateTime: at.toISOString(), timeZone });
  const body: Partial<GEvent> = {
    summary: d.title,
    ...(d.description !== undefined && { description: d.description }),
    location: d.location ?? '',
    // PATCH merges nested objects: clear the other kind of time, or a timed <-> all-day change is rejected.
    start: d.allDay ? { date: d.firstDay ?? toISODate(d.start), dateTime: null, timeZone: null } : timed(d.start, zones.start),
    end: d.allDay
      ? { date: addDays(d.lastDay ?? toISODate(d.start), 1), dateTime: null, timeZone: null }
      : timed(d.end, zones.end),
  };
  if (!d.keepReminders)
    body.reminders =
      d.reminderMinutes === undefined
        ? { useDefault: true }
        : { useDefault: false, overrides: d.reminderMinutes === null ? [] : [{ method: 'popup', minutes: d.reminderMinutes }] };
  if (!d.keepRecurrence) body.recurrence = d.repeat ? [toRRule(d.repeat, d.allDay)] : [];
  return body;
}

/**
 * What a new series made by "This and following" takes over from the old
 * one besides the editor's fields, as Google's own split does: the guests
 * stay invited, the color, reminders and visibility stay.
 */
const CARRIED = [
  'description',
  'colorId',
  'transparency',
  'visibility',
  'attendees',
  'guestsCanInviteOthers',
  'guestsCanModify',
  'guestsCanSeeOtherGuests',
  'anyoneCanAddSelf',
  'extendedProperties',
  'source',
  'reminders',
] as const;

function carried(master: GEvent): Record<string, unknown> {
  const m = master as unknown as Record<string, unknown>;
  return Object.fromEntries(CARRIED.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]));
}

/**
 * A changed repeat rule replaces the series' RRULE line only. Its other
 * lines stay: EXDATEs are occurrences deleted on other clients (phones
 * syncing over CalDAV, imported calendars), which would come back.
 */
function keepExdates(body: Partial<GEvent>, lines: string[]): Partial<GEvent> {
  if (body.recurrence?.length) body.recurrence = [...body.recurrence, ...lines.filter((l) => !l.startsWith('RRULE:'))];
  return body;
}

/** Where an occurrence sits in its series: its original start, which a moved occurrence no longer shows. */
const seriesStart = (ev: CalEvent) => ev.originalStart ?? ev.start;

/** How far the edit moves a series' occurrence that was at `from`: by days (all-day) or on the wall clock. */
const shiftOf = (from: Date, draft: EventDraft): SeriesShift =>
  draft.allDay
    ? { days: diffDays(toISODate(from), draft.firstDay ?? toISODate(draft.start)) }
    : { wallMs: wallOf(draft.start) - wallOf(from) };

/**
 * Occurrences of a COUNT series the series put before `before`, cancelled
 * ones included (COUNT counts them too). Counted by where the series had
 * each one (originalStartTime), since Google filters instances by where
 * they are now and one moved across the split would be counted on the
 * wrong side; a COUNT series is finite, so all of its instances are read.
 */
async function instancesBefore(cal: string, seriesId: string, before: Date): Promise<number> {
  let n = 0;
  let pageToken: string | undefined;
  do {
    const r = await call<{ items?: Partial<GEvent>[]; nextPageToken?: string }>(
      `/calendars/${cal}/events/${encodeURIComponent(seriesId)}/instances`,
      { query: { showDeleted: 'true', maxResults: '2500', ...(pageToken ? { pageToken } : {}) } },
    );
    for (const i of r.items ?? []) {
      const at = i.originalStartTime ?? i.start;
      if ((at?.date || at?.dateTime) && parseTime(at).at < before) n++;
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return n;
}

const roles = new Map<string, AccessRole>();

export const googleSource: CalendarSource = {
  async listCalendars() {
    const out: CalendarInfo[] = [];
    let pageToken: string | undefined;
    do {
      const r = await call<{ items?: any[]; nextPageToken?: string }>('/users/me/calendarList', {
        query: pageToken ? { pageToken } : {},
        background: true,
      });
      for (const c of r.items ?? []) {
        if (typeof c?.id !== 'string') continue;
        roles.set(c.id, c.accessRole);
        out.push({
          id: c.id,
          name: c.summaryOverride || c.summary || c.id,
          color: c.backgroundColor || '#9AA0A6',
          accessRole: c.accessRole,
          primary: c.primary === true,
        });
      }
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  },

  async listEvents(calendarId, timeMin, timeMax) {
    const out: CalEvent[] = [];
    let pageToken: string | undefined;
    do {
      const r = await call<{ items?: GEvent[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
        query: {
          singleEvents: 'true',
          orderBy: 'startTime',
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          maxResults: '2500',
          ...(pageToken ? { pageToken } : {}),
        },
        background: true,
      });
      for (const g of r.items ?? []) if (onWall(g)) out.push(toCalEvent(calendarId, g, roles.get(calendarId) ?? 'reader'));
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  },

  async nextOccurrence(calendarId, id, after) {
    const cal = encodeURIComponent(calendarId);
    const role = roles.get(calendarId) ?? 'reader';
    let g: GEvent;
    try {
      g = await call<GEvent>(`/calendars/${cal}/events/${encodeURIComponent(id)}`, { background: true });
    } catch (e) {
      if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) return null;
      throw e;
    }
    if (g.status === 'cancelled') return null;
    if (!g.recurrence?.length) {
      if (!onWall(g)) return null;
      const ev = toCalEvent(calendarId, g, role);
      return ev.end > after ? ev : null;
    }
    // A few instances, so one the household declined does not end the countdown.
    const r = await call<{ items?: GEvent[] }>(`/calendars/${cal}/events/${encodeURIComponent(id)}/instances`, {
      query: { timeMin: after.toISOString(), maxResults: '10' },
      background: true,
    });
    const next = r.items?.find(onWall);
    return next ? toCalEvent(calendarId, next, role) : null;
  },

  async seriesRecurrence(calendarId, seriesId) {
    const g = await call<GEvent>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(seriesId)}`);
    return g.recurrence ?? [];
  },

  async insert(calendarId, id, draft, earlier) {
    const cal = encodeURIComponent(calendarId);
    const path = `/calendars/${cal}/events/${encodeURIComponent(id)}`;
    // A new event is in the tablet's time zone.
    const body = draftBody(draft, zonesOf(true));
    // A failed save to another calendar may have added the event there (its answer lost): move it here (events.move).
    for (const from of earlier) {
      if (from === calendarId) continue;
      try {
        await call(`/calendars/${encodeURIComponent(from)}/events/${encodeURIComponent(id)}/move`, {
          method: 'POST',
          query: { destination: calendarId },
        });
      } catch (e) {
        if (e instanceof GoogleError && (e.status === 404 || e.status === 410)) continue;
        throw e;
      }
      await call(path, { method: 'PATCH', body: JSON.stringify(body) });
      return;
    }
    try {
      await call<GEvent>(`/calendars/${cal}/events`, { method: 'POST', body: JSON.stringify({ ...body, id }) });
    } catch (e) {
      // A retry after a lost response: the event exists already, so bring it up to date instead of adding it twice.
      if (!(e instanceof GoogleError && e.status === 409)) throw e;
      await call(path, { method: 'PATCH', body: JSON.stringify(body) });
    }
  },

  async update(ev, draft, scope) {
    const cal = encodeURIComponent(ev.calendarId);
    if (!ev.seriesId || scope === 'this') {
      const body = draftBody(
        { ...draft, keepRecurrence: ev.seriesId ? true : draft.keepRecurrence },
        zonesOf(ev.allDay, ev.timeZone, ev.endTimeZone),
      );
      await call(`/calendars/${cal}/events/${encodeURIComponent(ev.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
      return {};
    }
    const master = await call<GEvent>(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`);
    const masterStart = parseTime(master.start).at;
    const seriesAllDay = !master.start.dateTime;
    const zones = zonesOf(seriesAllDay, master.start.timeZone, master.end.timeZone);
    const cut = seriesStart(ev);
    if (scope === 'following' && toISODate(masterStart) < toISODate(cut)) {
      // Start a new series here, then end the old one just before this occurrence.
      const lines = master.recurrence ?? [];
      const body = { ...carried(master), ...keepExdates(draftBody({ ...draft, keepRecurrence: false }, zones), lines) };
      if (draft.keepRecurrence) {
        // A COUNT rule continues with the occurrences it has left, not a fresh COUNT.
        const count = recurrenceCount(lines);
        body.recurrence =
          count === null ? lines : withCount(lines, Math.max(1, count - (await instancesBefore(cal, ev.seriesId, cut))));
      }
      // The new series repeats at the edited occurrence's time: the deleted dates it carries move with it.
      if (body.recurrence && draft.allDay === seriesAllDay) body.recurrence = shiftExdates(body.recurrence, shiftOf(cut, draft));
      const created = await call<GEvent>(`/calendars/${cal}/events`, { method: 'POST', body: JSON.stringify(body) });
      try {
        await call(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ recurrence: endSeriesBefore(lines, cut, seriesAllDay) }),
        });
      } catch (e) {
        // Without the old series ended, the new one would double every occurrence.
        await del(`/calendars/${cal}/events/${encodeURIComponent(created.id)}`).catch(() => {});
        throw e;
      }
      return { newSeriesId: created.id };
    }
    // All occurrences: move the series start by however far this occurrence moved.
    let moved: EventDraft;
    if (draft.allDay) {
      const first = draft.firstDay ?? toISODate(draft.start);
      const last = draft.lastDay ?? first;
      const newFirst = addDays(toISODate(masterStart), diffDays(toISODate(ev.start), first));
      moved = { ...draft, firstDay: newFirst, lastDay: addDays(newFirst, diffDays(first, last)) };
    } else {
      // On the wall clock: moved a day across a clock change, the series keeps its time of day.
      const newStart = fromWall(wallOf(masterStart) + wallOf(draft.start) - wallOf(ev.start));
      moved = { ...draft, start: newStart, end: new Date(newStart.getTime() + (draft.end.getTime() - draft.start.getTime())) };
    }
    const body = keepExdates(draftBody(moved, zones), master.recurrence ?? []);
    if (draft.allDay === ev.allDay && +draft.start === +ev.start && +draft.end === +ev.end) {
      // Times not changed: the series keeps its own. The occurrence may be one moved or made longer on a
      // phone, whose times are not the series'.
      delete body.start;
      delete body.end;
    } else if (draft.allDay === seriesAllDay) {
      // The dates deleted on other clients move with the series, or they would come back at the new time.
      const lines = body.recurrence ?? master.recurrence ?? [];
      if (lines.some((l) => l.startsWith('EXDATE'))) body.recurrence = shiftExdates(lines, shiftOf(ev.start, draft));
    }
    await call(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`, { method: 'PATCH', body: JSON.stringify(body) });
    return {};
  },

  async remove(ev, scope) {
    const cal = encodeURIComponent(ev.calendarId);
    if (!ev.seriesId || scope === 'this') {
      await del(`/calendars/${cal}/events/${encodeURIComponent(ev.id)}`);
      return;
    }
    if (scope === 'all') {
      await del(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`);
      return;
    }
    const master = await call<GEvent>(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`);
    const cut = seriesStart(ev);
    if (toISODate(parseTime(master.start).at) >= toISODate(cut)) {
      await del(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`);
      return;
    }
    await call(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ recurrence: endSeriesBefore(master.recurrence ?? [], cut, !master.start.dateTime) }),
    });
  },
};
