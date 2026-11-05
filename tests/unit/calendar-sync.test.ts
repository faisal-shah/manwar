import { describe, expect, it, vi } from 'vitest';
import type { CalEvent, CalendarInfo, CalendarSource } from '../../src/calendar/types';
import type { EventMeta, Profile } from '../../src/data/types';

/**
 * The background sync across a change of Google account on the tablet:
 * startCalendarSync runs once per page, so this file has the engine to
 * itself. Browser globals are stand-ins (unit tests run in node).
 */

const storage = vi.hoisted(() => new Map<string, string>());
/** Characters a value may have before setItem throws, as a full localStorage does. */
const quota = vi.hoisted(() => ({ chars: Infinity }));
vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (v.length > quota.chars) throw new Error('QuotaExceededError');
      storage.set(k, v);
    },
    removeItem: (k: string) => void storage.delete(k),
  };
  g.document = { addEventListener() {}, visibilityState: 'visible' };
  g.window = { addEventListener() {} };
});

vi.mock('../../src/data/store', async () => {
  const { computed, signal } = await import('@preact/signals');
  const { DEFAULT_SETTINGS } = await import('../../src/data/settings');
  const data = { eventMeta: signal<EventMeta[]>([]), profiles: signal<Profile[]>([]) };
  const profileById = computed(() => new Map(data.profiles.value.map((p) => [p.id, p])));
  return {
    data,
    settings: signal(DEFAULT_SETTINGS),
    profileById,
    householdId: signal<string | null>(null),
    put: async () => {},
    remove: async () => {},
  };
});

const source = vi.hoisted(() => ({}) as CalendarSource);
vi.mock('../../src/calendar/google', () => ({ googleSource: source }));
vi.mock('../../src/data/session', () => ({ googleAccessToken: async () => 'token' }));

const store = await import('../../src/data/store');
const engine = await import('../../src/calendar/engine');

const cal = (id: string): CalendarInfo => ({ id, name: id, color: '#2D7F86', accessRole: 'owner', primary: true });
const ev = (calendarId: string, id: string, over: Partial<CalEvent> = {}): CalEvent => ({
  key: `${calendarId}::${id}`,
  calendarId,
  id,
  title: id,
  allDay: false,
  start: new Date(Date.now() + 86_400_000),
  end: new Date(Date.now() + 90_000_000),
  editable: true,
  ...over,
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const settle = () => new Promise((r) => setTimeout(r, 0));
const ids = () => engine.events.value.map((e) => e.id);

describe('calendar sync across a change of account', () => {
  it('never shows the last account, from memory or from the offline snapshot', async () => {
    // The tablet was connected to another family's account last time, and is offline now.
    storage.set(
      'manwar.events.v1',
      JSON.stringify({
        household: 'gOther',
        calendars: [cal('other@gmail.com')],
        events: [{ ...ev('other@gmail.com', 'their-dentist'), start: Date.now(), end: Date.now() + 3_600_000 }],
        from: '2026-01-01',
        to: '2027-01-01',
        at: Date.now(),
      }),
    );
    source.listCalendars = async () => {
      throw new Error('Failed to fetch');
    };
    store.householdId.value = 'gOurs';
    engine.startCalendarSync();
    await settle();
    expect(ids()).toEqual([]);
    expect(engine.calendars.value).toEqual([]);
    expect(storage.has('manwar.events.v1')).toBe(false);

    // Online: our events come in and are kept for next time, with their household and a moved occurrence's original start.
    const ours = ev('ours@gmail.com', 'swim_x', { seriesId: 'swim', originalStart: new Date('2026-11-21T15:30:00Z') });
    source.listCalendars = async () => [cal('ours@gmail.com')];
    source.listEvents = async () => [ours];
    await engine.refresh();
    expect(ids()).toEqual(['swim_x']);
    const saved = JSON.parse(storage.get('manwar.events.v1')!);
    expect([saved.household, saved.events[0].originalStart]).toEqual(['gOurs', Date.parse('2026-11-21T15:30:00Z')]);

    // A sync that is out when the tablet switches to a third account must not land.
    const gate = deferred();
    source.listEvents = async (id) => {
      await gate.promise;
      return [ev(id, 'late')];
    };
    const late = engine.refresh();
    await settle();
    source.listCalendars = async () => [cal('third@gmail.com')];
    const third = deferred();
    store.householdId.value = 'gThird';
    expect(ids()).toEqual([]);
    expect(engine.sync.value.lastSync).toBeNull();
    source.listEvents = async (id) => {
      await third.promise;
      return [ev(id, 'third-event')];
    };
    gate.resolve();
    await late;
    expect(ids()).toEqual([]);
    third.resolve();
    await engine.refresh();
    expect(engine.events.value.map((e) => e.key)).toEqual(['third@gmail.com::third-event']);
    expect(JSON.parse(storage.get('manwar.events.v1')!).household).toBe('gThird');

    // Signed out: nothing is shown and nothing is fetched.
    let asked = 0;
    source.listCalendars = async () => {
      asked++;
      return [];
    };
    store.householdId.value = null;
    await engine.refresh();
    expect([ids(), asked]).toEqual([[], 0]);
  });

  it('reads its own snapshot back, a moved occurrence with its original start as a date', async () => {
    const at = Date.parse('2026-11-23T22:00:00Z');
    storage.set(
      'manwar.events.v1',
      JSON.stringify({
        household: 'gOurs',
        calendars: [cal('ours@gmail.com')],
        events: [
          {
            ...ev('ours@gmail.com', 'swim_x', { seriesId: 'swim' }),
            start: at,
            end: at + 2_700_000,
            originalStart: at - 2 * 86_400_000,
          },
        ],
        from: '2026-01-01',
        to: '2027-01-01',
        at: Date.now(),
      }),
    );
    source.listCalendars = async () => {
      throw new Error('Failed to fetch');
    };
    store.householdId.value = 'gOurs';
    await settle();
    expect(ids()).toEqual(['swim_x']);
    expect(engine.events.value[0].originalStart).toEqual(new Date(at - 2 * 86_400_000));
    expect(engine.sync.value.error).toBe('Failed to fetch');
  });

  it('remembers a calendar that never loaded as never loaded, after a reload', async () => {
    const at = Date.now() - 3_600_000;
    // School failed in every fetch before the reload; ours last answered an hour ago.
    storage.set(
      'manwar.events.v1',
      JSON.stringify({
        household: 'gOurs',
        calendars: [cal('ours@gmail.com'), cal('school@group.calendar.google.com')],
        events: [],
        from: '2026-01-01',
        to: '2027-01-01',
        at,
        syncedAt: { 'ours@gmail.com': at },
      }),
    );
    store.householdId.value = null;
    await settle();
    source.listCalendars = async () => {
      throw new Error('Failed to fetch');
    };
    store.householdId.value = 'gOurs';
    await settle();
    expect(engine.sync.value.failing).toEqual([
      { name: 'ours@gmail.com', at },
      { name: 'school@group.calendar.google.com', at: null },
    ]);
  });

  it('keeps a snapshot that fits: without notes when they are too big, none rather than an old one', async () => {
    // A calendar with long invitations in its notes.
    const notes = '<p>Join Zoom Meeting https://us02web.zoom.us/j/81234567890</p>'.repeat(60);
    const many = Array.from({ length: 40 }, (_, i) => ev('ours@gmail.com', `e${i}`, { description: notes }));
    source.listCalendars = async () => [cal('ours@gmail.com')];
    source.listEvents = async () => many;
    quota.chars = 40_000;
    await engine.refresh();
    const saved = JSON.parse(storage.get('manwar.events.v1')!);
    expect(saved.events).toHaveLength(40);
    expect(saved.events[0].description).toBeUndefined();
    expect(engine.events.value[0].description).toBe(notes);
    // Not even that fits: no snapshot, rather than the last one coming back offline as if current.
    quota.chars = 1_000;
    await engine.refresh();
    expect(storage.has('manwar.events.v1')).toBe(false);
    quota.chars = Infinity;
  });

  it('takes a calendar hidden on another tablet off the wall at once, and fetches one shown again', async () => {
    const asked: string[] = [];
    source.listCalendars = async () => [cal('ours@gmail.com'), cal('school@group.calendar.google.com')];
    source.listEvents = async (id) => {
      asked.push(id);
      return [ev(id, `${id.split('@')[0]}-event`)];
    };
    await engine.refresh();
    expect(ids().sort()).toEqual(['ours-event', 'school-event']);
    // The settings snapshot from the other tablet arrives.
    asked.length = 0;
    store.settings.value = { ...store.settings.value, hiddenCalendars: ['school@group.calendar.google.com'] };
    expect(ids()).toEqual(['ours-event']);
    expect(asked).toEqual([]);
    store.settings.value = { ...store.settings.value, hiddenCalendars: [] };
    await settle();
    expect(asked.sort()).toEqual(['ours@gmail.com', 'school@group.calendar.google.com']);
    expect(ids().sort()).toEqual(['ours-event', 'school-event']);
  });

  it('keeps a calendar hidden during a fetch off the wall when the fetch lands', async () => {
    const school = 'school@group.calendar.google.com';
    source.listCalendars = async () => [cal('ours@gmail.com'), cal(school)];
    const answer = deferred();
    source.listEvents = async (id) => {
      await answer.promise;
      return [ev(id, `${id.split('@')[0]}-event`)];
    };
    const poll = engine.refresh();
    await settle();
    // Hidden while the poll's requests are on their way.
    store.settings.value = { ...store.settings.value, hiddenCalendars: [school] };
    answer.resolve();
    await poll;
    expect(ids()).toEqual(['ours-event']);
    store.settings.value = { ...store.settings.value, hiddenCalendars: [] };
    await settle();
  });

  it('keeps a far countdown of a calendar hidden during its lookup off the wall', async () => {
    const school = 'school@group.calendar.google.com';
    const camp = ev(school, 'camp', {
      allDay: true,
      start: new Date(Date.now() + 200 * 86_400_000),
      end: new Date(Date.now() + 201 * 86_400_000),
    });
    source.listCalendars = async () => [cal('ours@gmail.com'), cal(school)];
    source.listEvents = async () => [];
    const lookup = deferred();
    source.nextOccurrence = async () => {
      await lookup.promise;
      return camp;
    };
    // Switching to Always fetches once (nothing to count down to yet).
    store.settings.value = { ...store.settings.value, countdownWindow: 'always' };
    await settle();
    store.data.eventMeta.value = [{ id: engine.metaKey(school, 'camp'), profiles: [], countdown: true, updatedAt: 0 }];
    const poll = engine.refresh();
    await settle();
    // Hidden while Google is asked for the camp's next occurrence.
    store.settings.value = { ...store.settings.value, hiddenCalendars: [school] };
    lookup.resolve();
    await poll;
    expect(engine.countdowns.value).toEqual([]);
    store.settings.value = { ...store.settings.value, hiddenCalendars: [], countdownWindow: '3m' };
    store.data.eventMeta.value = [];
    await settle();
  });
});
