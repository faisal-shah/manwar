import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalEvent, EventDraft } from '../../src/calendar/types';

vi.mock('../../src/data/session', () => ({ googleAccessToken: async () => 'token' }));

const { googleSource } = await import('../../src/calendar/google');

/**
 * Google Calendar API boundary, against payloads shaped like real
 * events.list / calendarList responses (fields Google sends, including ones
 * the app ignores). Unit tests run with TZ=America/Chicago.
 */

interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  body: any;
}

let calls: Call[] = [];
let routes: ((c: Call) => { status?: number; body?: unknown } | undefined)[] = [];

beforeEach(() => {
  calls = [];
  routes = [];
  vi.stubGlobal('fetch', async (input: URL | string, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const c: Call = {
      method: init.method ?? 'GET',
      path: decodeURIComponent(url.pathname.replace('/calendar/v3', '')),
      query: Object.fromEntries(url.searchParams),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    for (const r of routes) {
      const res = r(c);
      if (res) {
        const status = res.status ?? 200;
        return new Response(status === 204 ? null : JSON.stringify(res.body ?? {}), { status });
      }
    }
    return new Response(JSON.stringify({ error: { message: `no route for ${c.method} ${c.path}` } }), { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const CAL = 'family.household@gmail.com';

const calendarList = (items: unknown[], nextPageToken?: string) => ({
  kind: 'calendar#calendarList',
  etag: '"p33k"',
  nextSyncToken: 'CPDAlvWDx70CEPDAlvWDx70CGAU=',
  ...(nextPageToken ? { nextPageToken } : {}),
  items,
});

const eventsPage = (items: unknown[], nextPageToken?: string) => ({
  kind: 'calendar#events',
  etag: '"p32c9n5q0hq6o80g"',
  summary: CAL,
  updated: '2026-11-04T17:00:00.000Z',
  timeZone: 'America/Chicago',
  accessRole: 'owner',
  defaultReminders: [{ method: 'popup', minutes: 10 }],
  ...(nextPageToken ? { nextPageToken } : {}),
  items,
});

const base = (over: Record<string, unknown>) => ({
  kind: 'calendar#event',
  etag: '"3400000000000000"',
  status: 'confirmed',
  htmlLink: 'https://www.google.com/calendar/event?eid=x',
  created: '2026-10-01T12:00:00.000Z',
  updated: '2026-10-01T12:00:00.000Z',
  creator: { email: CAL, self: true },
  organizer: { email: CAL, self: true },
  iCalUID: 'x@google.com',
  sequence: 0,
  reminders: { useDefault: true },
  eventType: 'default',
  ...over,
});

async function listOne(items: unknown[], role = 'owner'): Promise<CalEvent[]> {
  routes.push((c) =>
    c.path === '/users/me/calendarList'
      ? { body: calendarList([{ id: CAL, summary: CAL, accessRole: role, backgroundColor: '#9fe1e7', primary: true }]) }
      : undefined,
  );
  routes.push((c) => (c.path === `/calendars/${CAL}/events` ? { body: eventsPage(items) } : undefined));
  await googleSource.listCalendars();
  return googleSource.listEvents(CAL, new Date('2026-11-01T00:00'), new Date('2026-12-01T00:00'));
}

describe('google calendar: reading events', () => {
  it('maps a timed event with its time zone offset to the right instant', async () => {
    const [ev] = await listOne([
      base({
        id: 'dentist1',
        summary: 'Dentist',
        location: 'Smile Dental, 100 Main St',
        start: { dateTime: '2026-11-06T14:30:00-08:00', timeZone: 'America/Los_Angeles' },
        end: { dateTime: '2026-11-06T15:30:00-08:00', timeZone: 'America/Los_Angeles' },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
      }),
    ]);
    expect(ev.start.toISOString()).toBe('2026-11-06T22:30:00.000Z');
    expect(ev.end.getTime() - ev.start.getTime()).toBe(3_600_000);
    expect([ev.allDay, ev.title, ev.location, ev.reminderMinutes, ev.editable, ev.organizer]).toEqual([
      false,
      'Dentist',
      'Smile Dental, 100 Main St',
      30,
      true,
      undefined,
    ]);
    expect(ev.key).toBe(`${CAL}::dentist1`);
  });

  it('maps all-day dates to local midnights with an exclusive end', async () => {
    const [ev] = await listOne([
      base({ id: 'trip', summary: 'Camping trip', start: { date: '2026-11-21' }, end: { date: '2026-11-24' } }),
    ]);
    expect(ev.allDay).toBe(true);
    expect(ev.start).toEqual(new Date(2026, 10, 21));
    expect(ev.end).toEqual(new Date(2026, 10, 24));
    expect(ev.reminderMinutes).toBeUndefined();
  });

  it('titles events without a summary', async () => {
    const evs = await listOne([
      base({ id: 'a', start: { dateTime: '2026-11-05T09:00:00-06:00' }, end: { dateTime: '2026-11-05T10:00:00-06:00' } }),
      base({
        id: 'b',
        summary: '   ',
        start: { dateTime: '2026-11-05T11:00:00-06:00' },
        end: { dateTime: '2026-11-05T12:00:00-06:00' },
      }),
    ]);
    expect(evs.map((e) => e.title)).toEqual(['(No title)', '(No title)']);
  });

  it('marks invitations from someone else read-only unless guests may modify', async () => {
    const invite = (id: string, guestsCanModify?: boolean) =>
      base({
        id,
        summary: 'Soccer practice',
        organizer: { email: 'coach@club.example', displayName: 'Coach' },
        creator: { email: 'coach@club.example' },
        attendees: [
          { email: 'coach@club.example', organizer: true, responseStatus: 'accepted' },
          { email: CAL, self: true, responseStatus: 'needsAction' },
        ],
        ...(guestsCanModify === undefined ? {} : { guestsCanModify }),
        start: { dateTime: '2026-11-07T09:00:00-06:00' },
        end: { dateTime: '2026-11-07T10:00:00-06:00' },
      });
    const [a, b] = await listOne([invite('inv1'), invite('inv2', true)]);
    expect([a.organizer, a.editable]).toEqual(['coach@club.example', false]);
    expect([b.organizer, b.editable]).toEqual(['coach@club.example', true]);
  });

  it('keeps recurring instances apart and links them to their series', async () => {
    const inst = (day: string) =>
      base({
        id: `swim_${day.replace(/-/g, '')}T153000Z`,
        summary: 'Swim lesson',
        recurringEventId: 'swim',
        originalStartTime: { dateTime: `${day}T09:30:00-06:00`, timeZone: 'America/Chicago' },
        start: { dateTime: `${day}T09:30:00-06:00`, timeZone: 'America/Chicago' },
        end: { dateTime: `${day}T10:15:00-06:00`, timeZone: 'America/Chicago' },
      });
    const evs = await listOne([
      inst('2026-11-07'),
      // A cancelled exception (Google sends these with showDeleted or in incremental syncs).
      {
        kind: 'calendar#event',
        id: 'swim_20261114T153000Z',
        status: 'cancelled',
        recurringEventId: 'swim',
        originalStartTime: { dateTime: '2026-11-14T09:30:00-06:00' },
      },
      inst('2026-11-21'),
    ]);
    expect(evs.map((e) => [e.id, e.seriesId])).toEqual([
      ['swim_20261107T153000Z', 'swim'],
      ['swim_20261121T153000Z', 'swim'],
    ]);
  });

  it('keeps long descriptions whole', async () => {
    const description = `<b>Agenda</b><br>${'Bring water, sunscreen and snacks. '.repeat(400)}`;
    const [ev] = await listOne([
      base({ id: 'd', summary: 'Field day', description, start: { date: '2026-11-09' }, end: { date: '2026-11-10' } }),
    ]);
    expect(ev.description).toBe(description);
  });

  it('reads birthdays and holiday calendars as read-only', async () => {
    const [ev] = await listOne(
      [
        base({
          id: 'BIRTHDAY_contacts_abc_20261116',
          summary: "Grandma's birthday",
          eventType: 'birthday',
          birthdayProperties: { type: 'birthday', contact: 'people/c1' },
          organizer: { email: 'addressbook#contacts@group.v.calendar.google.com', displayName: 'Birthdays', self: true },
          recurringEventId: 'BIRTHDAY_contacts_abc',
          start: { date: '2026-11-16' },
          end: { date: '2026-11-17' },
          transparency: 'transparent',
          visibility: 'private',
        }),
      ],
      'reader',
    );
    expect([ev.title, ev.allDay, ev.editable, ev.seriesId]).toEqual(["Grandma's birthday", true, false, 'BIRTHDAY_contacts_abc']);
  });

  it('follows events.list pages', async () => {
    const ev = (i: number) =>
      base({
        id: `e${i}`,
        summary: `Event ${i}`,
        start: { dateTime: `2026-11-${String(2 + i).padStart(2, '0')}T09:00:00-06:00` },
        end: { dateTime: `2026-11-${String(2 + i).padStart(2, '0')}T10:00:00-06:00` },
      });
    routes.push((c) => {
      if (c.path !== `/calendars/${CAL}/events`) return undefined;
      if (!c.query.pageToken) return { body: eventsPage([ev(0), ev(1)], 'page2') };
      if (c.query.pageToken === 'page2') return { body: eventsPage([ev(2)], 'page3') };
      return { body: eventsPage([ev(3)]) };
    });
    const evs = await googleSource.listEvents(CAL, new Date('2026-11-01T00:00'), new Date('2026-12-01T00:00'));
    expect(evs.map((e) => e.id)).toEqual(['e0', 'e1', 'e2', 'e3']);
    expect(calls.map((c) => c.query.pageToken ?? '')).toEqual(['', 'page2', 'page3']);
    expect(calls[0].query).toMatchObject({ singleEvents: 'true', timeMin: '2026-11-01T05:00:00.000Z' });
  });

  it('follows calendarList pages and prefers the user-set name', async () => {
    routes.push((c) => {
      if (c.path !== '/users/me/calendarList') return undefined;
      if (!c.query.pageToken)
        return {
          body: calendarList([{ id: CAL, summary: CAL, summaryOverride: 'Family', accessRole: 'owner', primary: true }], 'n'),
        };
      return {
        body: calendarList([
          {
            id: 'en.usa#holiday@group.v.calendar.google.com',
            summary: 'Holidays in United States',
            accessRole: 'reader',
            backgroundColor: '#16a765',
          },
        ]),
      };
    });
    const cals = await googleSource.listCalendars();
    expect(cals.map((c) => [c.name, c.accessRole, c.primary])).toEqual([
      ['Family', 'owner', true],
      ['Holidays in United States', 'reader', false],
    ]);
  });

  describe('next occurrence (countdowns past the window)', () => {
    const after = new Date('2026-11-04T00:00');
    it('returns a one-off event until it has ended', async () => {
      routes.push((c) =>
        c.path === `/calendars/${CAL}/events/trip`
          ? { body: base({ id: 'trip', summary: 'Umrah', start: { date: '2027-06-10' }, end: { date: '2027-06-20' } }) }
          : undefined,
      );
      const ev = await googleSource.nextOccurrence(CAL, 'trip', after);
      expect([ev?.title, ev?.allDay, ev?.start]).toEqual(['Umrah', true, new Date(2027, 5, 10)]);
      expect(await googleSource.nextOccurrence(CAL, 'trip', new Date('2027-06-20T00:00'))).toBeNull();
    });
    it('asks a series for its first instance from the date on', async () => {
      routes.push((c) =>
        c.path === `/calendars/${CAL}/events/bday`
          ? {
              body: base({
                id: 'bday',
                summary: 'Hashim turns 7',
                recurrence: ['RRULE:FREQ=YEARLY'],
                start: { date: '2020-08-14' },
                end: { date: '2020-08-15' },
              }),
            }
          : undefined,
      );
      routes.push((c) =>
        c.path === `/calendars/${CAL}/events/bday/instances`
          ? {
              body: {
                items: [
                  base({
                    id: 'bday_20270814',
                    recurringEventId: 'bday',
                    summary: 'Hashim turns 7',
                    start: { date: '2027-08-14' },
                    end: { date: '2027-08-15' },
                  }),
                ],
              },
            }
          : undefined,
      );
      const ev = await googleSource.nextOccurrence(CAL, 'bday', after);
      expect([ev?.id, ev?.seriesId]).toEqual(['bday_20270814', 'bday']);
      expect(calls.at(-1)!.query).toMatchObject({ timeMin: after.toISOString(), maxResults: '1' });
    });
    it('treats an event deleted meanwhile as none', async () => {
      routes.push((c) =>
        c.path === `/calendars/${CAL}/events/old` ? { status: 410, body: { error: { message: 'Gone' } } } : undefined,
      );
      expect(await googleSource.nextOccurrence(CAL, 'old', after)).toBeNull();
    });
  });
});

describe('google calendar: writing events', () => {
  const timed: CalEvent = {
    key: `${CAL}::dentist1`,
    calendarId: CAL,
    id: 'dentist1',
    title: 'Dentist',
    allDay: false,
    start: new Date('2026-11-06T16:30'),
    end: new Date('2026-11-06T17:30'),
    editable: true,
  };
  const allDayDraft: EventDraft = {
    title: 'Dentist',
    allDay: true,
    start: new Date('2026-11-06T00:00'),
    end: new Date('2026-11-07T00:00'),
    firstDay: '2026-11-06',
    lastDay: '2026-11-06',
    keepRecurrence: false,
  };

  // PATCH merges nested objects, so switching between timed and all-day must clear the other field.
  it('clears dateTime when a timed event becomes all-day, and date when it becomes timed', async () => {
    routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'dentist1' } } : undefined));
    await googleSource.update(timed, allDayDraft, 'all');
    expect(calls[0].body.start).toEqual({ date: '2026-11-06', dateTime: null, timeZone: null });
    expect(calls[0].body.end).toEqual({ date: '2026-11-07', dateTime: null, timeZone: null });

    const back: EventDraft = {
      ...allDayDraft,
      allDay: false,
      start: new Date('2026-11-06T09:00'),
      end: new Date('2026-11-06T10:00'),
    };
    await googleSource.update({ ...timed, allDay: true }, back, 'all');
    expect(calls[1].body.start).toEqual({ date: null, dateTime: '2026-11-06T15:00:00.000Z', timeZone: 'America/Chicago' });
    expect(calls[1].body.end).toEqual({ date: null, dateTime: '2026-11-06T16:00:00.000Z', timeZone: 'America/Chicago' });
  });

  describe('this and following', () => {
    const occ: CalEvent = {
      key: `${CAL}::swim_20261121T153000Z`,
      calendarId: CAL,
      id: 'swim_20261121T153000Z',
      seriesId: 'swim',
      title: 'Swim lesson',
      allDay: false,
      start: new Date('2026-11-21T09:30'),
      end: new Date('2026-11-21T10:15'),
      editable: true,
    };
    const draft: EventDraft = {
      title: 'Swim lesson',
      allDay: false,
      start: new Date('2026-11-21T10:00'),
      end: new Date('2026-11-21T10:45'),
      keepRecurrence: true,
    };
    const master = (recurrence: string[]) =>
      base({
        id: 'swim',
        summary: 'Swim lesson',
        recurrence,
        start: { dateTime: '2026-10-31T09:30:00-05:00', timeZone: 'America/Chicago' },
        end: { dateTime: '2026-10-31T10:15:00-05:00', timeZone: 'America/Chicago' },
      });

    it('continues a COUNT rule with the occurrences it has left', async () => {
      routes.push((c) =>
        c.method === 'GET' && c.path === `/calendars/${CAL}/events/swim`
          ? { body: master(['RRULE:FREQ=WEEKLY;COUNT=10']) }
          : undefined,
      );
      // Oct 31, Nov 7 (cancelled), Nov 14 come before Nov 21.
      routes.push((c) =>
        c.path === `/calendars/${CAL}/events/swim/instances`
          ? { body: { items: [{ id: 'a' }, { id: 'b', status: 'cancelled' }, { id: 'c' }] } }
          : undefined,
      );
      routes.push((c) => (c.method === 'POST' ? { body: { id: 'swim2' } } : undefined));
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'swim' } } : undefined));
      expect(await googleSource.update(occ, draft, 'following')).toEqual({ newSeriesId: 'swim2' });
      const post = calls.find((c) => c.method === 'POST')!;
      expect(post.body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;COUNT=7']);
      const patch = calls.find((c) => c.method === 'PATCH')!;
      expect(patch.body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261121T055959Z']);
      expect(calls.find((c) => c.path.endsWith('/instances'))!.query).toMatchObject({
        showDeleted: 'true',
        timeMax: '2026-11-21T15:30:00.000Z',
      });
    });

    it('keeps an UNTIL rule as it is', async () => {
      routes.push((c) =>
        c.method === 'GET' && c.path === `/calendars/${CAL}/events/swim`
          ? { body: master(['RRULE:FREQ=WEEKLY;UNTIL=20261231']) }
          : undefined,
      );
      routes.push((c) => (c.method === 'POST' ? { body: { id: 'swim2' } } : undefined));
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'swim' } } : undefined));
      await googleSource.update(occ, draft, 'following');
      expect(calls.find((c) => c.method === 'POST')!.body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261231']);
      expect(calls.some((c) => c.path.endsWith('/instances'))).toBe(false);
    });

    it('creates the new series first and removes it again when the old one cannot be ended', async () => {
      routes.push((c) => (c.method === 'GET' ? { body: master(['RRULE:FREQ=WEEKLY']) } : undefined));
      routes.push((c) => (c.method === 'POST' ? { body: { id: 'swim2' } } : undefined));
      routes.push((c) => (c.method === 'PATCH' ? { status: 503, body: { error: { message: 'Backend Error' } } } : undefined));
      routes.push((c) => (c.method === 'DELETE' ? { status: 204 } : undefined));
      await expect(googleSource.update(occ, draft, 'following')).rejects.toThrow('503');
      expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
        `GET /calendars/${CAL}/events/swim`,
        `POST /calendars/${CAL}/events`,
        `PATCH /calendars/${CAL}/events/swim`,
        `DELETE /calendars/${CAL}/events/swim2`,
      ]);
    });
  });

  it('treats deleting an event that is already gone as done', async () => {
    routes.push((c) =>
      c.method === 'DELETE' ? { status: 410, body: { error: { code: 410, message: 'Resource has been deleted' } } } : undefined,
    );
    await expect(googleSource.remove(timed, 'all')).resolves.toBeUndefined();
  });

  it('still reports other delete failures', async () => {
    routes.push((c) =>
      c.method === 'DELETE' ? { status: 403, body: { error: { code: 403, message: 'Forbidden' } } } : undefined,
    );
    await expect(googleSource.remove(timed, 'all')).rejects.toThrow('Google Calendar 403: Forbidden');
  });
});
