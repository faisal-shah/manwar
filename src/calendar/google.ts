import { googleAccessToken } from '../data/session';
import { addDays, diffDays, fromISODate, toISODate } from '../lib/date';
import { endSeriesBefore, recurrenceCount, toRRule, withCount } from './rrule';
import { eventKey, type AccessRole, type CalEvent, type CalendarInfo, type CalendarSource, type EventDraft } from './types';

const API = 'https://www.googleapis.com/calendar/v3';

class GoogleError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Google Calendar API boundary: every response is validated here. */
async function call<T>(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const token = await googleAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleError(res.status, `Google Calendar ${res.status}: ${body?.error?.message ?? res.statusText}`);
  return body as T;
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
  summary?: string;
  description?: string;
  location?: string;
  start: GTime;
  end: GTime;
  recurringEventId?: string;
  recurrence?: string[];
  organizer?: { email?: string; self?: boolean };
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

function toCalEvent(calendarId: string, g: GEvent, role: AccessRole): CalEvent {
  const s = parseTime(g.start);
  const e = parseTime(g.end);
  const popup =
    g.reminders?.useDefault === false ? (g.reminders.overrides?.find((o) => o.method === 'popup')?.minutes ?? null) : undefined;
  return {
    key: eventKey(calendarId, g.id),
    calendarId,
    id: g.id,
    seriesId: g.recurringEventId,
    title: g.summary?.trim() || '(No title)',
    allDay: s.allDay,
    start: s.at,
    end: e.at,
    location: g.location || undefined,
    description: g.description || undefined,
    organizer: g.organizer && !g.organizer.self ? g.organizer.email : undefined,
    editable:
      (role === 'owner' || role === 'writer') && (!g.organizer || g.organizer.self === true || g.guestsCanModify === true),
    reminderMinutes: popup,
  };
}

function draftBody(d: EventDraft): Partial<GEvent> {
  const tz = zone();
  const body: Partial<GEvent> = {
    summary: d.title,
    description: d.description ?? '',
    location: d.location ?? '',
    // PATCH merges nested objects: clear the other kind of time, or a timed <-> all-day change is rejected.
    start: d.allDay
      ? { date: d.firstDay ?? toISODate(d.start), dateTime: null, timeZone: null }
      : { date: null, dateTime: d.start.toISOString(), timeZone: tz },
    end: d.allDay
      ? { date: addDays(d.lastDay ?? toISODate(d.start), 1), dateTime: null, timeZone: null }
      : { date: null, dateTime: d.end.toISOString(), timeZone: tz },
    reminders:
      d.reminderMinutes === undefined
        ? { useDefault: true }
        : { useDefault: false, overrides: d.reminderMinutes === null ? [] : [{ method: 'popup', minutes: d.reminderMinutes }] },
  };
  if (!d.keepRecurrence) body.recurrence = d.repeat ? [toRRule(d.repeat, d.allDay)] : [];
  return body;
}

/** Occurrences of a series starting before `before`, cancelled ones included (COUNT counts them too). */
async function instancesBefore(cal: string, seriesId: string, before: Date): Promise<number> {
  let n = 0;
  let pageToken: string | undefined;
  do {
    const r = await call<{ items?: unknown[]; nextPageToken?: string }>(
      `/calendars/${cal}/events/${encodeURIComponent(seriesId)}/instances`,
      {
        query: { showDeleted: 'true', timeMax: before.toISOString(), maxResults: '2500', ...(pageToken ? { pageToken } : {}) },
      },
    );
    n += r.items?.length ?? 0;
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
      });
      for (const g of r.items ?? []) {
        if (g.status === 'cancelled' || !g.start || !g.end) continue;
        out.push(toCalEvent(calendarId, g, roles.get(calendarId) ?? 'reader'));
      }
      pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  },

  async seriesRecurrence(calendarId, seriesId) {
    const g = await call<GEvent>(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(seriesId)}`);
    return g.recurrence ?? [];
  },

  async insert(calendarId, draft) {
    const g = await call<GEvent>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(draftBody(draft)),
    });
    return { id: g.id };
  },

  async update(ev, draft, scope) {
    const cal = encodeURIComponent(ev.calendarId);
    if (!ev.seriesId || scope === 'this') {
      const body = draftBody({ ...draft, keepRecurrence: ev.seriesId ? true : draft.keepRecurrence });
      await call(`/calendars/${cal}/events/${encodeURIComponent(ev.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
      return {};
    }
    const master = await call<GEvent>(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`);
    const masterStart = parseTime(master.start).at;
    if (scope === 'following' && toISODate(masterStart) < toISODate(ev.start)) {
      // Start a new series here, then end the old one the day before this occurrence.
      const lines = master.recurrence ?? [];
      const body = draftBody({ ...draft, keepRecurrence: false });
      if (draft.keepRecurrence) {
        // A COUNT rule continues with the occurrences it has left, not a fresh COUNT.
        const count = recurrenceCount(lines);
        body.recurrence =
          count === null ? lines : withCount(lines, Math.max(1, count - (await instancesBefore(cal, ev.seriesId, ev.start))));
      }
      const created = await call<GEvent>(`/calendars/${cal}/events`, { method: 'POST', body: JSON.stringify(body) });
      try {
        await call(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ recurrence: endSeriesBefore(lines, toISODate(ev.start), ev.allDay) }),
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
      const newStart = new Date(masterStart.getTime() + (draft.start.getTime() - ev.start.getTime()));
      moved = { ...draft, start: newStart, end: new Date(newStart.getTime() + (draft.end.getTime() - draft.start.getTime())) };
    }
    await call(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`, {
      method: 'PATCH',
      body: JSON.stringify(draftBody(moved)),
    });
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
    if (toISODate(parseTime(master.start).at) >= toISODate(ev.start)) {
      await del(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`);
      return;
    }
    await call(`/calendars/${cal}/events/${encodeURIComponent(ev.seriesId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ recurrence: endSeriesBefore(master.recurrence ?? [], toISODate(ev.start), ev.allDay) }),
    });
  },
};
