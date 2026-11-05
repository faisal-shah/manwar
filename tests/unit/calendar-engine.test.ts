import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalEvent, CalendarInfo, CalendarSource } from '../../src/calendar/types';
import type { EventMeta, Profile } from '../../src/data/types';

/**
 * Calendar engine against an in-memory store and a scripted calendar
 * source (no Firestore, no network). Unit tests run with TZ=America/Chicago.
 */

vi.mock('../../src/data/store', async () => {
  const { computed, signal } = await import('@preact/signals');
  const { DEFAULT_SETTINGS } = await import('../../src/data/settings');
  const data = { eventMeta: signal<EventMeta[]>([]), profiles: signal<Profile[]>([]) };
  const settings = signal(DEFAULT_SETTINGS);
  const profileById = computed(() => new Map(data.profiles.value.map((p) => [p.id, p])));
  const put = async (coll: 'eventMeta', doc: EventMeta) => {
    data[coll].value = [...data[coll].value.filter((d) => d.id !== doc.id), doc];
  };
  const remove = async (coll: 'eventMeta', id: string) => {
    data[coll].value = data[coll].value.filter((d) => d.id !== id);
  };
  return { data, settings, profileById, put, remove };
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

/** Today is the real date in tests; build the series around it. */
const day = (offset: number, hhmm = '09:00') => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

beforeEach(() => {
  store.data.eventMeta.value = [];
  store.data.profiles.value = [profile('asiyah'), profile('hashim')];
  store.settings.value = DEFAULT_SETTINGS;
  engine.events.value = [];
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
