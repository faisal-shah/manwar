import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimited, type CalEvent, type CalendarInfo, type CalendarSource } from '../../src/calendar/types';
import type { EventMeta, Profile } from '../../src/data/types';

/**
 * The background sync backs off while Google says it is over its rate
 * limit: polls, page turns and coming back online do not ask again until
 * the pause ends, while a person's save still goes through. The pause is
 * module state, so this file has the engine to itself.
 */

vi.mock('../../src/data/store', async () => {
  const { computed, signal } = await import('@preact/signals');
  const { DEFAULT_SETTINGS } = await import('../../src/data/settings');
  const data = { eventMeta: signal<EventMeta[]>([]), profiles: signal<Profile[]>([]) };
  return {
    data,
    settings: signal(DEFAULT_SETTINGS),
    profileById: computed(() => new Map(data.profiles.value.map((p) => [p.id, p]))),
    householdId: signal<string | null>('h1'),
    put: async () => {},
    upsert: async () => {},
    remove: async () => {},
  };
});

const source = vi.hoisted(() => ({}) as CalendarSource);
vi.mock('../../src/calendar/google', () => ({ googleSource: source }));
vi.mock('../../src/data/session', () => ({ googleAccessToken: async () => 'token' }));
vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  const mem = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

const store = await import('../../src/data/store');
const engine = await import('../../src/calendar/engine');

const CAL: CalendarInfo = { id: 'fam', name: 'Family', color: '#2D7F86', accessRole: 'owner', primary: true };
const SCHOOL: CalendarInfo = { ...CAL, id: 'school', name: 'School', primary: false };
const ev = (id: string): CalEvent => ({
  key: `fam::${id}`,
  calendarId: 'fam',
  id,
  title: id,
  allDay: false,
  start: new Date(Date.now() + 86_400_000),
  end: new Date(Date.now() + 90_000_000),
  editable: true,
});

let asked = 0;
let limit: RateLimited | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  asked = 0;
  limit = null;
  source.listCalendars = async () => {
    asked++;
    if (limit) throw limit;
    return [CAL];
  };
  source.listEvents = async () => [ev('dentist')];
});
afterEach(async () => {
  // Leave the engine unpaused for the next test: one good fetch.
  source.listCalendars = async () => [CAL];
  source.listEvents = async () => [];
  await engine.syncNow();
  vi.useRealTimers();
});

describe('calendar sync under a rate limit', () => {
  it('pauses the background sync, then fetches once when the pause ends', async () => {
    limit = new RateLimited('Google Calendar is busy. Try again in a minute.', null);
    await engine.refresh();
    expect(asked).toBe(1);
    expect(engine.sync.value.error).toBe('Google Calendar is busy. Try again in a minute.');

    // Polls, page turns and the tablet waking all ask during the pause; none reaches Google.
    await engine.refresh();
    engine.ensureRange('2020-01-01', '2020-02-01');
    await engine.refresh();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(asked).toBe(1);

    limit = null;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(asked).toBe(2);
    expect(engine.events.value.map((e) => e.id)).toEqual(['dentist']);
    expect(engine.sync.value.error).toBeNull();
  });

  it('pauses longer with each limit in a row, and as long as Google asked when that is longer', async () => {
    limit = new RateLimited('busy', null);
    await engine.refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked).toBe(2);
    // Limited again: two minutes this time.
    await vi.advanceTimersByTimeAsync(119_000);
    expect(asked).toBe(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(asked).toBe(3);

    // Google names ten minutes, longer than the four the backoff would wait.
    limit = new RateLimited('busy', 10 * 60_000);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(asked).toBe(4);
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(asked).toBe(4);
    limit = null;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked).toBe(5);

    // A good fetch starts the backoff over: the next limit pauses a minute again.
    limit = new RateLimited('busy', null);
    await engine.refresh();
    expect(asked).toBe(6);
    limit = null;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked).toBe(7);
  });

  it('pauses when one calendar is limited, and keeps that calendar’s events', async () => {
    source.listCalendars = async () => {
      asked++;
      return [CAL, SCHOOL];
    };
    const kept = { ...ev('play'), key: 'school::play', calendarId: 'school' };
    engine.events.value = [kept];
    source.listEvents = async (id) => {
      if (id === 'school') throw new RateLimited('busy', null);
      return [ev('dentist')];
    };
    await engine.refresh();
    expect(engine.events.value.map((e) => e.id).sort()).toEqual(['dentist', 'play']);
    await engine.refresh();
    expect(asked).toBe(1);
  });

  it('pauses when Google limits a countdown looked up past the window', async () => {
    const { DEFAULT_SETTINGS } = await import('../../src/data/settings');
    source.nextOccurrence = async () => {
      throw new RateLimited('busy', null);
    };
    store.data.eventMeta.value = [{ id: engine.metaKey('fam', 'trip'), profiles: [], countdown: true, updatedAt: 0 }];
    store.settings.value = { ...DEFAULT_SETTINGS, countdownWindow: 'always' };
    try {
      await engine.refresh();
      expect(asked).toBe(1);
      await engine.refresh();
      expect(asked).toBe(1);
    } finally {
      store.data.eventMeta.value = [];
      store.settings.value = DEFAULT_SETTINGS;
    }
  });

  it('does not hold back a save, and Google taking the save resumes the sync', async () => {
    limit = new RateLimited('busy', null);
    await engine.refresh();
    expect(asked).toBe(1);
    limit = null;
    let inserted = 0;
    source.insert = async () => void inserted++;
    await engine.createEvent('fam', 'new1', { title: 'Dentist', allDay: false, start: new Date(), end: new Date() }, []);
    expect([inserted, asked]).toEqual([1, 2]);
  });

  it('fetches a saved event even when the poll running at the save is limited', async () => {
    // A poll is on its way when the save goes through; Google limits the poll.
    let answer!: () => void;
    source.listCalendars = () => {
      asked++;
      if (asked > 1) return Promise.resolve([CAL]);
      return new Promise((_, reject) => (answer = () => reject(new RateLimited('busy', null))));
    };
    const poll = engine.refresh();
    source.insert = async () => {};
    const saved = engine.createEvent('fam', 'new2', { title: 'Swim', allDay: false, start: new Date(), end: new Date() }, []);
    await vi.advanceTimersByTimeAsync(0);
    answer();
    await poll;
    // The fetch the save waits for still runs, though the poll paused the background sync.
    await saved;
    expect(asked).toBe(2);
    expect(engine.events.value.map((e) => e.id)).toEqual(['dentist']);
  });

  it('does not pause for other errors', async () => {
    source.listCalendars = async () => {
      asked++;
      throw new Error('Failed to fetch');
    };
    await engine.refresh();
    await engine.refresh();
    expect(asked).toBe(2);
  });
});
