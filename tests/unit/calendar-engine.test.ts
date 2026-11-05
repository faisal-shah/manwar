import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalEvent, CalendarInfo, CalendarSource } from '../../src/calendar/types';
import type { EventMeta, Profile } from '../../src/data/types';

/**
 * Calendar engine against an in-memory store and a scripted calendar
 * source (no Firestore, no network). Unit tests run with TZ=America/Chicago.
 */

/**
 * The eventMeta documents as the database holds them. Writes land here the
 * way Firestore applies them (put replaces, upsert merges) and in the local
 * view; a test can put a document here that the local view has not seen
 * (another device's write still on its way).
 */
const server = vi.hoisted(() => new Map<string, EventMeta>());

vi.mock('../../src/data/store', async () => {
  const { computed, signal } = await import('@preact/signals');
  const { DEFAULT_SETTINGS } = await import('../../src/data/settings');
  const data = { eventMeta: signal<EventMeta[]>([]), profiles: signal<Profile[]>([]) };
  const settings = signal(DEFAULT_SETTINGS);
  const profileById = computed(() => new Map(data.profiles.value.map((p) => [p.id, p])));
  const show = (doc: EventMeta) => (data.eventMeta.value = [...data.eventMeta.value.filter((d) => d.id !== doc.id), doc]);
  const put = async (_coll: 'eventMeta', doc: EventMeta) => {
    server.set(doc.id, doc);
    show(doc);
  };
  const upsert = async (_coll: 'eventMeta', id: string, partial: Partial<EventMeta>) => {
    const merge = (base?: EventMeta) =>
      Object.fromEntries(Object.entries({ ...base, ...partial }).filter(([, v]) => v !== undefined)) as unknown as EventMeta;
    server.set(id, merge(server.get(id)));
    show(merge(data.eventMeta.value.find((d) => d.id === id)));
  };
  const remove = async (_coll: 'eventMeta', id: string) => {
    server.delete(id);
    data.eventMeta.value = data.eventMeta.value.filter((d) => d.id !== id);
  };
  return { data, settings, profileById, put, upsert, remove, householdId: signal<string | null>('h1') };
});

const source = vi.hoisted(() => ({}) as CalendarSource);
vi.mock('../../src/calendar/google', () => ({ googleSource: source }));
vi.mock('../../src/data/session', () => ({ googleAccessToken: async () => 'token' }));

const store = await import('../../src/data/store');
const engine = await import('../../src/calendar/engine');
const { DEFAULT_SETTINGS } = await import('../../src/data/settings');
const { nowMs, today } = await import('../../src/lib/clock');
const { addDays, addMonths, toISODate } = await import('../../src/lib/date');

const CAL: CalendarInfo = { id: 'fam', name: 'Family', color: '#2D7F86', accessRole: 'owner', primary: true };

const ev = (id: string, start: string, end: string, over: Partial<CalEvent> = {}): CalEvent => ({
  key: `fam::${id}`,
  calendarId: 'fam',
  id,
  title: id,
  allDay: false,
  start: new Date(start),
  end: new Date(end),
  editable: true,
  ...over,
});

const profile = (id: string): Profile => ({ id, name: id, color: '#123456', order: 0, stars: 0, createdAt: 0 });
const meta = (id: string, profiles: string[], extra: Partial<EventMeta> = {}): EventMeta => ({
  id: engine.metaKey('fam', id),
  profiles,
  updatedAt: 0,
  ...extra,
});
const metaDoc = (id: string) => store.data.eventMeta.value.find((m) => m.id === engine.metaKey('fam', id));

/** Today is the real date in tests; build the series around it. */
const day = (offset: number, hhmm = '09:00') => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const swim = (offset: number) =>
  ev(`swim_${offset}`, day(offset, '09:30'), day(offset, '10:15'), { seriesId: 'swim', title: 'Swim lesson' });

beforeEach(() => {
  server.clear();
  store.data.eventMeta.value = [];
  store.data.profiles.value = [profile('asiyah'), profile('hashim')];
  store.settings.value = DEFAULT_SETTINGS;
  engine.events.value = [];
});

describe('event metadata for series and occurrences', () => {
  it('turning a countdown off on an occurrence with its own profiles keeps the series profiles', () => {
    const [a, b] = [swim(3), swim(10)];
    engine.events.value = [a, b];
    store.data.eventMeta.value = [meta('swim', ['asiyah'], { countdown: true }), meta(a.id, ['hashim'], { countdown: true })];
    engine.setCountdown(a, false);
    expect(metaDoc('swim')?.profiles).toEqual(['asiyah']);
    expect(engine.profilesOf(b)).toEqual(['asiyah']);
    // The toggle takes effect on the occurrence it was flipped on.
    expect(engine.metaFor(a)?.countdown).toBe(false);
    expect(engine.profilesOf(a)).toEqual(['hashim']);
  });

  it('assigning one occurrence does not copy the series countdown onto it', () => {
    const a = swim(3);
    engine.events.value = [a];
    store.data.eventMeta.value = [meta('swim', ['asiyah'], { countdown: true })];
    engine.assign(a, ['hashim'], 'instance');
    expect(metaDoc(a.id)?.profiles).toEqual(['hashim']);
    // Countdowns stay a series setting: turning it off for the series turns it off here too.
    engine.setCountdown(a, false);
    expect(engine.metaFor(a)?.countdown).toBeFalsy();
  });

  it('writes only what it changes, so a change another device made meanwhile is kept', () => {
    const a = swim(3);
    engine.events.value = [a];
    // The other device turned the countdown on; this one has not seen that yet.
    store.data.eventMeta.value = [meta('swim', ['asiyah'])];
    server.set(engine.metaKey('fam', 'swim'), meta('swim', ['asiyah'], { countdown: true }));
    engine.assign(a, ['hashim'], 'series');
    expect(server.get(engine.metaKey('fam', 'swim'))).toMatchObject({ profiles: ['hashim'], countdown: true });
    // And the other way round: a countdown change keeps profiles assigned elsewhere.
    server.set(engine.metaKey('fam', 'swim'), meta('swim', ['asiyah', 'hashim'], { countdown: true }));
    engine.setCountdown(a, false);
    expect(server.get(engine.metaKey('fam', 'swim'))).toMatchObject({ profiles: ['asiyah', 'hashim'], countdown: false });
  });

  it('assigning the whole series keeps its countdown and drops the occurrence override', () => {
    const a = swim(3);
    engine.events.value = [a];
    store.data.eventMeta.value = [meta('swim', ['asiyah'], { countdown: true }), meta(a.id, ['hashim'])];
    engine.assign(a, ['asiyah', 'hashim'], 'series');
    expect(metaDoc('swim')).toMatchObject({ profiles: ['asiyah', 'hashim'], countdown: true });
    expect(metaDoc(a.id)).toBeUndefined();
  });
});

describe('saving an edited occurrence', () => {
  const draft = (e: CalEvent) => ({ title: e.title, allDay: false, start: e.start, end: e.end, keepRecurrence: true });
  beforeEach(() => {
    source.update = async () => ({});
    source.listCalendars = async () => [CAL];
    source.listEvents = async () => engine.events.value;
  });

  it('"This event" without a change of profiles leaves the occurrence following its series', async () => {
    const [a, b] = [swim(3), swim(10)];
    engine.events.value = [a, b];
    store.data.eventMeta.value = [meta('swim', ['asiyah'])];
    await engine.updateEvent(a, draft(a), 'this', ['asiyah'], { countdown: false });
    expect(metaDoc(a.id)).toBeUndefined();
    engine.assign(b, ['hashim'], 'series');
    expect(engine.profilesOf(a)).toEqual(['hashim']);
  });

  it('"This event" with other profiles overrides that occurrence only', async () => {
    const [a, b] = [swim(3), swim(10)];
    engine.events.value = [a, b];
    store.data.eventMeta.value = [meta('swim', ['asiyah'])];
    await engine.updateEvent(a, draft(a), 'this', ['hashim'], { countdown: true });
    expect(engine.profilesOf(a)).toEqual(['hashim']);
    expect(engine.metaFor(a)?.countdown).toBe(true);
    expect(engine.profilesOf(b)).toEqual(['asiyah']);
    expect(engine.metaFor(b)?.countdown).toBeFalsy();
  });

  it('"All events" applies to the edited occurrence too', async () => {
    const [a, b] = [swim(3), swim(10)];
    engine.events.value = [a, b];
    store.data.eventMeta.value = [meta('swim', ['asiyah']), meta(a.id, ['hashim'], { countdown: true })];
    await engine.updateEvent(a, draft(a), 'all', ['asiyah', 'hashim'], { countdown: false });
    expect(engine.profilesOf(a)).toEqual(['asiyah', 'hashim']);
    expect(engine.metaFor(a)?.countdown).toBe(false);
    expect(metaDoc(a.id)).toBeUndefined();
  });

  it('deleting one occurrence drops its own document and keeps the series one', async () => {
    const a = swim(3);
    engine.events.value = [a];
    source.remove = async () => {};
    store.data.eventMeta.value = [meta('swim', ['asiyah']), meta(a.id, ['hashim'])];
    await engine.deleteEvent(a, 'this');
    expect(metaDoc(a.id)).toBeUndefined();
    expect(metaDoc('swim')?.profiles).toEqual(['asiyah']);
  });
});

describe('adding an event', () => {
  const draft = { title: 'Dentist', allDay: false, start: new Date(day(2, '16:30')), end: new Date(day(2, '17:30')) };
  beforeEach(() => {
    source.listCalendars = async () => [CAL];
    source.listEvents = async () => [];
  });

  it('tells a retry to another calendar where the failed save went', async () => {
    const sent: string[][] = [];
    let fail = true;
    source.insert = async (cal, _id, _d, earlier) => {
      sent.push([cal, ...earlier]);
      if (fail) throw new Error('Google Calendar did not answer in time.');
    };
    await expect(engine.createEvent('fam', 'e1', draft, ['asiyah'])).rejects.toThrow('did not answer');
    expect(metaDoc('e1')).toBeUndefined();
    fail = false;
    await engine.createEvent('school', 'e1', draft, ['asiyah']);
    expect(sent).toEqual([['fam'], ['school', 'fam']]);
    expect(store.data.eventMeta.value.map((m) => m.id)).toEqual([engine.metaKey('school', 'e1')]);
    // A later event starts with nothing to move.
    await engine.createEvent('fam', 'e2', draft, ['asiyah']);
    expect(sent.at(-1)).toEqual(['fam']);
  });
});

describe('triage queue', () => {
  it('keeps a series whose next occurrence alone was assigned', () => {
    const [a, b, c] = [swim(1), swim(8), swim(15)];
    engine.events.value = [a, b, c];
    store.data.eventMeta.value = [meta(a.id, ['hashim'])];
    expect(engine.unassigned.value.map((e) => e.id)).toEqual([b.id]);
  });

  it('lists each unassigned series once, by its next occurrence', () => {
    const [a, b] = [swim(1), swim(8)];
    const one = ev('dentist', day(2, '16:30'), day(2, '17:30'));
    engine.events.value = [a, one, b];
    expect(engine.unassigned.value.map((e) => e.id)).toEqual([a.id, 'dentist']);
    store.data.eventMeta.value = [meta('swim', ['hashim'])];
    expect(engine.unassigned.value.map((e) => e.id)).toEqual(['dentist']);
  });
});

describe('which days an event is on', () => {
  it('shows a zero-length event at midnight on its day', () => {
    const z = ev('z', '2026-11-08T00:00', '2026-11-08T00:00');
    engine.events.value = [z];
    expect(engine.daysOf(z)).toEqual(['2026-11-08']);
    expect(engine.eventsOn('2026-11-08').map((e) => e.id)).toEqual(['z']);
    expect(engine.eventsOn('2026-11-07')).toEqual([]);
  });

  it('puts events on the days they touch, end exclusive', () => {
    const overnight = ev('o', '2026-11-10T22:00', '2026-11-11T02:00');
    const toMidnight = ev('m', '2026-11-10T22:00', '2026-11-11T00:00');
    const noon = ev('n', '2026-11-07T12:00', '2026-11-07T12:00');
    const trip = ev('t', '2026-11-21T00:00', '2026-11-24T00:00', { allDay: true });
    engine.events.value = [overnight, toMidnight, noon, trip];
    expect(engine.daysOf(overnight)).toEqual(['2026-11-10', '2026-11-11']);
    expect(engine.daysOf(toMidnight)).toEqual(['2026-11-10']);
    expect(engine.daysOf(noon)).toEqual(['2026-11-07']);
    expect(engine.daysOf(trip)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23']);
    expect(engine.eventsOn('2026-11-11').map((e) => e.id)).toEqual(['o']);
    expect(engine.eventsOn('2026-11-24')).toEqual([]);
  });
});

describe('refresh', () => {
  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };

  it('fetches again for a request made while a fetch is running', async () => {
    let stored = [ev('old', day(1), day(1, '10:00'))];
    const gate = deferred<void>();
    let n = 0;
    source.listCalendars = async () => [CAL];
    source.listEvents = async () => {
      const snapshot = stored;
      if (n++ === 0) await gate.promise;
      return snapshot;
    };
    const first = engine.refresh();
    await Promise.resolve();
    // An event saved while the first fetch is out: the caller's refresh must include it.
    stored = [...stored, ev('new', day(2), day(2, '10:00'))];
    const second = engine.refresh();
    gate.resolve();
    await second;
    await first;
    expect(engine.events.value.map((e) => e.id)).toEqual(['old', 'new']);
    expect(n).toBe(2);
  });

  it('runs one more fetch for any number of requests during a fetch', async () => {
    const gate = deferred<void>();
    let n = 0;
    source.listCalendars = async () => [CAL];
    source.listEvents = async () => {
      if (n++ === 0) await gate.promise;
      return [];
    };
    const all = [engine.refresh(), engine.refresh(), engine.refresh(), engine.refresh()];
    gate.resolve();
    await Promise.all(all);
    expect(n).toBe(2);
  });

  it('fetches around today and the viewed days, and follows today', async () => {
    const windows: string[] = [];
    source.listCalendars = async () => [CAL];
    source.listEvents = async (_id, a, b) => {
      windows.push(`${toISODate(a)}..${toISODate(b)}`);
      return [];
    };
    const t = today.value;
    await engine.refresh();
    expect(windows.pop()).toBe(`${addDays(t, -42)}..${addMonths(t, 4)}`);
    // Paging far back widens the window...
    engine.ensureRange('2020-03-01', '2020-04-11');
    await engine.refresh();
    expect(windows.pop()).toBe(`2020-02-16..${addMonths(t, 4)}`);
    // ...and coming back to today narrows it again.
    engine.ensureRange(t, addDays(t, 3));
    await engine.refresh();
    expect(windows.pop()).toBe(`${addDays(t, -42)}..${addMonths(t, 4)}`);
    // Months later (the view following today asks for its new days) the window has moved with today.
    nowMs.value += 200 * 86_400_000;
    engine.ensureRange(today.value, addDays(today.value, 3));
    await engine.refresh();
    expect(windows.pop()).toBe(`${addDays(today.value, -42)}..${addMonths(today.value, 4)}`);
    nowMs.value -= 200 * 86_400_000;
  });

  it('keeps the last events of a calendar that fails to load and still updates the others', async () => {
    const other: CalendarInfo = { ...CAL, id: 'school', primary: false, accessRole: 'reader' };
    const kept = ev('kept', day(1), day(1, '10:00'), { calendarId: 'school', key: 'school::kept' });
    engine.events.value = [kept];
    source.listCalendars = async () => [CAL, other];
    source.listEvents = async (id) => {
      if (id === 'school') throw new Error('Google Calendar 404: Not Found');
      return [ev('fresh', day(2), day(2, '10:00'))];
    };
    await engine.refresh();
    expect(engine.events.value.map((e) => e.id).sort()).toEqual(['fresh', 'kept']);
    expect(engine.sync.value.error).toContain('404');
  });
});

describe('countdowns past the fetched window', () => {
  it('fetches them one by one with the Always setting, and only hourly', async () => {
    const trip = ev('trip', day(200, '00:00'), day(203, '00:00'), { allDay: true, title: 'Umrah trip' });
    const asked: string[] = [];
    source.listCalendars = async () => [CAL];
    source.listEvents = async () => [];
    source.nextOccurrence = async (_cal, id) => {
      asked.push(id);
      return id === 'trip' ? trip : null;
    };
    store.data.eventMeta.value = [meta('trip', ['asiyah'], { countdown: true }), meta('gone', ['asiyah'], { countdown: true })];
    store.settings.value = { ...DEFAULT_SETTINGS, countdownWindow: '3m' };
    await engine.refresh();
    expect(asked).toEqual([]);
    expect(engine.countdowns.value).toEqual([]);

    store.settings.value = { ...DEFAULT_SETTINGS, countdownWindow: 'always' };
    await engine.refresh();
    expect(asked.sort()).toEqual(['gone', 'trip']);
    expect(engine.countdowns.value.map((c) => [c.ev.id, c.days])).toEqual([['trip', 200]]);
    // The next poll reuses what it found.
    await engine.refresh();
    expect(asked).toHaveLength(2);
    expect(engine.countdowns.value.map((c) => c.ev.id)).toEqual(['trip']);
  });
});
