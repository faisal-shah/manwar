import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newEventId, type CalEvent, type EventDraft } from '../../src/calendar/types';

/** The session's token cache: dropping the current token makes the next one new. */
const tokens = vi.hoisted(() => ({ n: 0, dropped: [] as string[] }));
vi.mock('../../src/data/session', () => ({
  googleAccessToken: async () => `token${tokens.n}`,
  dropGoogleToken: (t: string) => {
    tokens.dropped.push(t);
    if (t === `token${tokens.n}`) tokens.n++;
  },
}));

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
  token: string;
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
      token: String((init.headers as Record<string, string>).Authorization).replace('Bearer ', ''),
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
    expect([ev.timeZone, ev.endTimeZone]).toEqual(['America/Los_Angeles', 'America/Los_Angeles']);
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

  describe('what belongs on the wall', () => {
    const at = (h: number) => ({ dateTime: `2026-11-05T${String(h).padStart(2, '0')}:00:00-06:00`, timeZone: 'America/Chicago' });

    it('leaves out working locations and focus time, keeps out of office, birthdays and Gmail events', async () => {
      const evs = await listOne([
        base({
          id: 'wl',
          eventType: 'workingLocation',
          summary: 'Home',
          transparency: 'transparent',
          visibility: 'public',
          workingLocationProperties: { type: 'homeOffice', homeOffice: {} },
          start: { date: '2026-11-05' },
          end: { date: '2026-11-06' },
        }),
        base({
          id: 'ft',
          eventType: 'focusTime',
          summary: 'Focus time',
          focusTimeProperties: { autoDeclineMode: 'declineOnlyNewConflictingInvitations', chatStatus: 'doNotDisturb' },
          start: at(9),
          end: at(11),
        }),
        base({
          id: 'ooo',
          eventType: 'outOfOffice',
          summary: 'Out of office',
          outOfOfficeProperties: { autoDeclineMode: 'declineAllConflictingInvitations' },
          start: at(12),
          end: at(17),
        }),
        base({
          id: 'BIRTHDAY_c1_20261105',
          eventType: 'birthday',
          summary: "Grandma's birthday",
          birthdayProperties: { type: 'birthday', contact: 'people/c1' },
          recurringEventId: 'BIRTHDAY_c1',
          start: { date: '2026-11-05' },
          end: { date: '2026-11-06' },
        }),
        base({
          id: 'gmail1',
          eventType: 'fromGmail',
          summary: 'Flight to Istanbul (TK 6)',
          organizer: { email: 'unknownorganizer@calendar.google.com', displayName: 'Unknown Organizer' },
          start: { dateTime: '2026-11-05T21:00:00-06:00', timeZone: 'America/Chicago' },
          end: { dateTime: '2026-11-06T17:05:00+03:00', timeZone: 'Europe/Istanbul' },
        }),
      ]);
      expect(evs.map((e) => e.id)).toEqual(['ooo', 'BIRTHDAY_c1_20261105', 'gmail1']);
    });

    it('leaves out invitations the household declined and keeps ones it has not answered', async () => {
      const invite = (id: string, responseStatus: string, h: number) =>
        base({
          id,
          summary: `Party ${id}`,
          organizer: { email: 'neighbor@example.com' },
          creator: { email: 'neighbor@example.com' },
          attendees: [
            { email: 'neighbor@example.com', organizer: true, responseStatus: 'accepted' },
            { email: CAL, self: true, responseStatus },
          ],
          start: at(h),
          end: at(h + 1),
        });
      const evs = await listOne([
        invite('no', 'declined', 9),
        invite('maybe', 'tentative', 10),
        invite('new', 'needsAction', 11),
      ]);
      expect(evs.map((e) => e.id)).toEqual(['maybe', 'new']);
    });

    it('does not offer edits Google refuses: birthdays, Gmail events, locked copies', async () => {
      const evs = await listOne([
        base({
          id: 'bday',
          eventType: 'birthday',
          summary: 'Hashim turns 7',
          birthdayProperties: { type: 'birthday', contact: 'people/c2' },
          start: { date: '2026-11-05' },
          end: { date: '2026-11-06' },
        }),
        base({ id: 'locked', summary: 'Room booking', locked: true, start: at(8), end: at(9) }),
        base({ id: 'plain', summary: 'Dentist', start: at(10), end: at(11) }),
        base({
          id: 'resto',
          eventType: 'fromGmail',
          summary: 'Dinner reservation',
          organizer: { email: 'unknownorganizer@calendar.google.com' },
          start: at(18),
          end: at(20),
        }),
      ]);
      expect(evs.map((e) => [e.id, e.editable])).toEqual([
        ['bday', false],
        ['locked', false],
        ['plain', true],
        ['resto', false],
      ]);
      // Gmail adds its events under a placeholder organizer, not someone who invited the family.
      expect(evs.find((e) => e.id === 'resto')!.organizer).toBeUndefined();
    });

    it('calls an event whose details are hidden from the household Busy', async () => {
      const priv = base({ id: 'p', visibility: 'private', start: at(9), end: at(10) });
      const [shared] = await listOne([priv], 'reader');
      expect(shared.title).toBe('Busy');
      routes = [];
      const [busy] = await listOne(
        [{ kind: 'calendar#event', id: 'fb', status: 'confirmed', start: at(9), end: at(10) }],
        'freeBusyReader',
      );
      expect([busy.title, busy.editable]).toEqual(['Busy', false]);
      // On its own calendar an untitled private event is just untitled.
      routes = [];
      const [own] = await listOne([priv], 'owner');
      expect(own.title).toBe('(No title)');
    });

    it('keeps the original start of a moved occurrence', async () => {
      const [ev] = await listOne([
        base({
          id: 'swim_20261121T153000Z',
          summary: 'Swim lesson',
          recurringEventId: 'swim',
          originalStartTime: { dateTime: '2026-11-21T09:30:00-06:00', timeZone: 'America/Chicago' },
          start: { dateTime: '2026-11-23T16:00:00-06:00', timeZone: 'America/Chicago' },
          end: { dateTime: '2026-11-23T16:45:00-06:00', timeZone: 'America/Chicago' },
        }),
      ]);
      expect(ev.start.toISOString()).toBe('2026-11-23T22:00:00.000Z');
      expect(ev.originalStart?.toISOString()).toBe('2026-11-21T15:30:00.000Z');
    });
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
      expect(calls.at(-1)!.query).toMatchObject({ timeMin: after.toISOString() });
    });
    it('skips an occurrence the household declined', async () => {
      const inst = (day: string, responseStatus: string) =>
        base({
          id: `class_${day.replace(/-/g, '')}`,
          recurringEventId: 'class',
          summary: 'Art class',
          organizer: { email: 'teacher@school.example' },
          attendees: [{ email: CAL, self: true, responseStatus }],
          start: { dateTime: `${day}T16:00:00-06:00` },
          end: { dateTime: `${day}T17:00:00-06:00` },
        });
      routes.push((c) =>
        c.path === `/calendars/${CAL}/events/class`
          ? {
              body: base({
                id: 'class',
                summary: 'Art class',
                recurrence: ['RRULE:FREQ=WEEKLY'],
                start: { dateTime: '2026-09-03T16:00:00-05:00' },
                end: { dateTime: '2026-09-03T17:00:00-05:00' },
              }),
            }
          : undefined,
      );
      routes.push((c) =>
        c.path === `/calendars/${CAL}/events/class/instances`
          ? { body: { items: [inst('2026-11-05', 'declined'), inst('2026-11-12', 'accepted')] } }
          : undefined,
      );
      expect((await googleSource.nextOccurrence(CAL, 'class', after))?.id).toBe('class_20261112');
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
      expect(patch.body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261121T152959Z']);
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

    // Saturday's lesson was moved to Monday afternoon on a phone. The series still has it on Saturday,
    // so a cut at the moved day (end of Sunday) would keep it in the old series and show it twice.
    const moved: CalEvent = {
      ...occ,
      originalStart: new Date('2026-11-21T09:30'),
      start: new Date('2026-11-23T16:00'),
      end: new Date('2026-11-23T16:45'),
    };

    it('splits a moved occurrence where the series had it', async () => {
      routes.push((c) => (c.method === 'GET' ? { body: master(['RRULE:FREQ=WEEKLY;COUNT=10']) } : undefined));
      routes.push((c) =>
        c.path.endsWith('/instances') ? { body: { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } } : undefined,
      );
      routes.push((c) => (c.method === 'POST' ? { body: { id: 'swim2' } } : undefined));
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'swim' } } : undefined));
      await googleSource.update(moved, { ...draft, start: moved.start, end: moved.end }, 'following');
      expect(calls.find((c) => c.method === 'PATCH')!.body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261121T152959Z']);
      expect(calls.find((c) => c.path.endsWith('/instances'))!.query.timeMax).toBe('2026-11-21T15:30:00.000Z');
    });

    it('deletes a moved occurrence and the rest from where the series had it', async () => {
      routes.push((c) => (c.method === 'GET' ? { body: master(['RRULE:FREQ=WEEKLY']) } : undefined));
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'swim' } } : undefined));
      await googleSource.remove(moved, 'following');
      expect(calls.at(-1)!.body).toEqual({ recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261121T152959Z'] });
    });

    it('carries the guests, color, reminders and time zone over to the new series', async () => {
      const reminders = {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 },
          { method: 'popup', minutes: 10 },
          { method: 'popup', minutes: 60 },
        ],
      };
      const attendees = [
        { email: CAL, self: true, organizer: true, responseStatus: 'accepted' },
        { email: 'nani@example.co.uk', displayName: 'Nani', responseStatus: 'accepted' },
      ];
      routes.push((c) =>
        c.method === 'GET'
          ? {
              body: base({
                id: 'call',
                summary: 'Call with Nani',
                recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=SA'],
                start: { dateTime: '2026-10-31T16:00:00+00:00', timeZone: 'Europe/London' },
                end: { dateTime: '2026-10-31T16:30:00+00:00', timeZone: 'Europe/London' },
                colorId: '5',
                attendees,
                reminders,
                guestsCanModify: true,
                hangoutLink: 'https://meet.google.com/abc-defg-hij',
              }),
            }
          : undefined,
      );
      routes.push((c) => (c.method === 'POST' ? { body: { id: 'call2' } } : undefined));
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'call' } } : undefined));
      const callOcc: CalEvent = {
        ...occ,
        key: `${CAL}::call_20261121T160000Z`,
        id: 'call_20261121T160000Z',
        seriesId: 'call',
        title: 'Call with Nani',
        originalStart: new Date('2026-11-21T16:00:00Z'),
        start: new Date('2026-11-21T16:00:00Z'),
        end: new Date('2026-11-21T16:30:00Z'),
      };
      await googleSource.update(
        callOcc,
        { ...draft, title: 'Call with Nani and Nana', start: callOcc.start, end: callOcc.end, keepReminders: true },
        'following',
      );
      const post = calls.find((c) => c.method === 'POST')!.body;
      expect(post).toMatchObject({
        summary: 'Call with Nani and Nana',
        colorId: '5',
        attendees,
        reminders,
        guestsCanModify: true,
      });
      expect(post.start).toEqual({ date: null, dateTime: '2026-11-21T16:00:00.000Z', timeZone: 'Europe/London' });
      expect(post.end.timeZone).toBe('Europe/London');
      expect(Object.keys(post)).not.toContain('id');
      expect(Object.keys(post)).not.toContain('etag');
    });
  });

  describe('changing an event keeps what the editor does not show', () => {
    const london: CalEvent = {
      ...timed,
      id: 'call',
      key: `${CAL}::call`,
      start: new Date('2026-11-07T16:00:00Z'),
      end: new Date('2026-11-07T16:30:00Z'),
      timeZone: 'Europe/London',
      endTimeZone: 'Europe/London',
    };
    const draft: EventDraft = {
      title: 'Call with Nani',
      allDay: false,
      start: london.start,
      end: london.end,
      keepRecurrence: true,
      reminderMinutes: 10,
      keepReminders: true,
    };

    it('a timed event keeps its own time zone and its reminders', async () => {
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'call' } } : undefined));
      await googleSource.update(london, draft, 'all');
      expect(calls[0].body.start).toEqual({ date: null, dateTime: '2026-11-07T16:00:00.000Z', timeZone: 'Europe/London' });
      expect(calls[0].body.end).toEqual({ date: null, dateTime: '2026-11-07T16:30:00.000Z', timeZone: 'Europe/London' });
      expect(calls[0].body).not.toHaveProperty('reminders');
      expect(calls[0].body).not.toHaveProperty('recurrence');
    });

    it("a one-off event without a zone that starts to repeat gets the tablet's", async () => {
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'call' } } : undefined));
      const plain = { ...london, timeZone: undefined, endTimeZone: undefined };
      await googleSource.update(plain, { ...draft, keepRecurrence: false, repeat: { every: 1, unit: 'week' } }, 'all');
      expect(calls[0].body.start.timeZone).toBe('America/Chicago');
      expect(calls[0].body.recurrence).toEqual(['RRULE:FREQ=WEEKLY']);
    });

    it('a changed reminder replaces the reminders', async () => {
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'call' } } : undefined));
      await googleSource.update(london, { ...draft, reminderMinutes: 30, keepReminders: false }, 'all');
      expect(calls[0].body.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] });
    });

    it('moving a whole series keeps the zone it repeats in', async () => {
      const occ: CalEvent = { ...london, id: 'call_20261121T160000Z', key: `${CAL}::call_20261121T160000Z`, seriesId: 'call' };
      routes.push((c) =>
        c.method === 'GET'
          ? {
              body: base({
                id: 'call',
                recurrence: ['RRULE:FREQ=WEEKLY'],
                start: { dateTime: '2026-10-31T16:00:00+00:00', timeZone: 'Europe/London' },
                end: { dateTime: '2026-10-31T16:30:00+00:00', timeZone: 'Europe/London' },
              }),
            }
          : undefined,
      );
      routes.push((c) => (c.method === 'PATCH' ? { body: { id: 'call' } } : undefined));
      // Half an hour later, every week.
      const later = (d: Date) => new Date(d.getTime() + 30 * 60_000);
      await googleSource.update(occ, { ...draft, start: later(occ.start), end: later(occ.end) }, 'all');
      const patch = calls.find((c) => c.method === 'PATCH')!.body;
      expect(patch.start).toEqual({ date: null, dateTime: '2026-10-31T16:30:00.000Z', timeZone: 'Europe/London' });
    });
  });

  it('gives up on a request Google does not answer, so later syncs are not held up', async () => {
    vi.useFakeTimers();
    try {
      // A connection that died without closing: nothing comes back until the request is aborted.
      vi.stubGlobal(
        'fetch',
        (_url: URL, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          ),
      );
      const pending = googleSource.listEvents(CAL, new Date('2026-11-01T00:00'), new Date('2026-12-01T00:00'));
      const outcome = pending.then(
        () => 'resolved',
        (e: Error) => e.message,
      );
      await vi.advanceTimersByTimeAsync(29_000);
      expect(await Promise.race([outcome, Promise.resolve('waiting')])).toBe('waiting');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await outcome).toBe('Google Calendar did not answer in time.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for a new token once when Google refuses the current one', async () => {
    tokens.dropped = [];
    const start = tokens.n;
    routes.push((c) =>
      c.token === `token${start}` ? { status: 401, body: { error: { code: 401, message: 'Invalid Credentials' } } } : undefined,
    );
    routes.push((c) => (c.path === `/calendars/${CAL}/events` ? { body: eventsPage([]) } : undefined));
    await googleSource.listEvents(CAL, new Date('2026-11-01T00:00'), new Date('2026-12-01T00:00'));
    expect(tokens.dropped).toEqual([`token${start}`]);
    expect(calls.map((c) => c.token)).toEqual([`token${start}`, `token${start + 1}`]);
    // A refusal of the new token too is an error, not a loop.
    routes.unshift(() => ({ status: 401, body: { error: { code: 401, message: 'Invalid Credentials' } } }));
    await expect(googleSource.listEvents(CAL, new Date('2026-11-01T00:00'), new Date('2026-12-01T00:00'))).rejects.toThrow(
      'Google Calendar 401',
    );
  });

  it('adds an event under the id the app chose, and a retry updates it instead of adding it twice', async () => {
    const id = newEventId();
    expect(id).toMatch(/^[0-9a-v]{26}$/);
    expect(newEventId()).not.toBe(id);
    const draft: EventDraft = {
      ...allDayDraft,
      allDay: false,
      start: new Date('2026-11-06T09:00'),
      end: new Date('2026-11-06T10:00'),
    };
    routes.push((c) =>
      c.method === 'POST' && calls.filter((x) => x.method === 'POST').length === 1 ? { body: { id } } : undefined,
    );
    routes.push((c) =>
      c.method === 'POST'
        ? { status: 409, body: { error: { code: 409, message: 'The requested identifier already exists.' } } }
        : undefined,
    );
    routes.push((c) => (c.method === 'PATCH' ? { body: { id } } : undefined));
    await googleSource.insert(CAL, id, draft);
    expect(calls[0].body).toMatchObject({ id, summary: 'Dentist' });
    // The response was lost and the parent taps Add again, with the title fixed.
    await googleSource.insert(CAL, id, { ...draft, title: 'Dentist (Asiyah)' });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      `POST /calendars/${CAL}/events`,
      `POST /calendars/${CAL}/events`,
      `PATCH /calendars/${CAL}/events/${id}`,
    ]);
    expect(calls[2].body.summary).toBe('Dentist (Asiyah)');
  });

  describe('the requests each scope sends', () => {
    const master = base({
      id: 'piano',
      summary: 'Piano',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'],
      start: { dateTime: '2026-11-02T16:00:00-06:00', timeZone: 'America/Chicago' },
      end: { dateTime: '2026-11-02T16:30:00-06:00', timeZone: 'America/Chicago' },
    });
    const occ = (day: string): CalEvent => ({
      key: `${CAL}::piano_${day.replace(/-/g, '')}T220000Z`,
      calendarId: CAL,
      id: `piano_${day.replace(/-/g, '')}T220000Z`,
      seriesId: 'piano',
      originalStart: new Date(`${day}T16:00`),
      title: 'Piano',
      allDay: false,
      start: new Date(`${day}T16:00`),
      end: new Date(`${day}T16:30`),
      editable: true,
      timeZone: 'America/Chicago',
      endTimeZone: 'America/Chicago',
    });
    const draft = (day: string, keep = true): EventDraft => ({
      title: 'Piano',
      allDay: false,
      start: new Date(`${day}T16:15`),
      end: new Date(`${day}T16:45`),
      keepRecurrence: keep,
      keepReminders: true,
      reminderMinutes: undefined,
    });
    const sent = () => calls.map((c) => `${c.method} ${c.path.replace(`/calendars/${CAL}/events`, '')}`);
    beforeEach(() => {
      routes.push((c) => (c.method === 'GET' ? { body: master } : undefined));
      routes.push((c) => (c.method === 'DELETE' ? { status: 204 } : undefined));
      routes.push((c) => (c.method === 'PATCH' || c.method === 'POST' ? { body: { id: 'piano2' } } : undefined));
    });

    it('adds a new repeating event with every field set', async () => {
      await googleSource.insert(CAL, 'new1', {
        ...draft('2026-11-09', false),
        keepReminders: false,
        reminderMinutes: null,
        repeat: { every: 1, unit: 'week', weekdays: [3, 1] },
      });
      expect(calls[0].body).toEqual({
        id: 'new1',
        summary: 'Piano',
        description: '',
        location: '',
        start: { date: null, dateTime: '2026-11-09T22:15:00.000Z', timeZone: 'America/Chicago' },
        end: { date: null, dateTime: '2026-11-09T22:45:00.000Z', timeZone: 'America/Chicago' },
        reminders: { useDefault: false, overrides: [] },
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'],
      });
    });

    it('This event patches the occurrence alone, without a recurrence', async () => {
      await googleSource.update(occ('2026-11-11'), draft('2026-11-11'), 'this');
      expect(sent()).toEqual(['PATCH /piano_20261111T220000Z']);
      expect(calls[0].body).toEqual({
        summary: 'Piano',
        description: '',
        location: '',
        start: { date: null, dateTime: '2026-11-11T22:15:00.000Z', timeZone: 'America/Chicago' },
        end: { date: null, dateTime: '2026-11-11T22:45:00.000Z', timeZone: 'America/Chicago' },
      });
    });

    it('This and following from the first occurrence changes the whole series', async () => {
      await googleSource.update(occ('2026-11-02'), draft('2026-11-02'), 'following');
      expect(sent()).toEqual(['GET /piano', 'PATCH /piano']);
      expect(calls[1].body.start.dateTime).toBe('2026-11-02T22:15:00.000Z');
    });

    it('deletes one occurrence, the rest from one, or the series', async () => {
      await googleSource.remove(occ('2026-11-11'), 'this');
      await googleSource.remove(occ('2026-11-11'), 'all');
      await googleSource.remove(occ('2026-11-02'), 'following');
      await googleSource.remove(occ('2026-11-11'), 'following');
      expect(sent()).toEqual([
        'DELETE /piano_20261111T220000Z',
        'DELETE /piano',
        'GET /piano',
        'DELETE /piano',
        'GET /piano',
        'PATCH /piano',
      ]);
      expect(calls.at(-1)!.body).toEqual({ recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261111T215959Z'] });
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
