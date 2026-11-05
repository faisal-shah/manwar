import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A household is seeded once in its life, and only once the server confirms
 * it is empty and was never seeded. A household that is already set up (a
 * real one today has only its Grocery List) is marked seeded and left alone,
 * whatever the local cache says.
 *
 * While Firestore counts itself offline (a first answer slower than its
 * 10 s allowance), asking fails at once, and the server's later answer
 * raises no new snapshot for an unchanged empty result, so seeding waits
 * on the next ask: it must come within seconds, not a long period.
 */

const fs = vi.hoisted(() => ({
  asks: 0,
  reachable: false,
  server: { seededAt: undefined as number | undefined, profiles: 0, lists: 0 },
}));
vi.mock('firebase/firestore', () => ({
  limit: () => ({}),
  query: (q: { name: string }) => q,
  getDocsFromServer: async (q: { name: 'profiles' | 'lists' }) => {
    fs.asks++;
    if (!fs.reachable) throw new Error('Failed to get documents from server.');
    return { empty: fs.server[q.name] === 0 };
  },
  getDocFromServer: async () => {
    fs.asks++;
    if (!fs.reachable) throw new Error('Failed to get document from server.');
    return { get: (k: string) => (k === 'seededAt' ? fs.server.seededAt : undefined) };
  },
}));

const store = vi.hoisted(() => ({ commits: 0, marks: [] as object[], confirmed: false }));
vi.mock('../../src/data/store', async () => {
  const { signal } = await import('@preact/signals');
  const batch = () => {
    const api = { put: () => api, settings: () => api, commit: async () => void store.commits++ };
    return api;
  };
  return {
    batch,
    colRef: (name: string) => ({ name }),
    confirmedByServer: () => store.confirmed,
    data: { profiles: signal<unknown[]>([]), lists: signal<unknown[]>([]) },
    householdId: signal<string | null>('h1'),
    newId: () => 'id',
    saveSettings: async (s: object) => void store.marks.push(s),
    settings: signal<{ seededAt?: number }>({}),
    settingsRef: () => ({}),
  };
});
vi.mock('../../src/calendar/engine', () => ({ metaKey: (c: string, id: string) => `${c}::${id}` }));

const { seedIfEmpty } = await import('../../src/data/seed');
const s = await import('../../src/data/store');
const setSettings = (v: object) => (s.settings.value = v as never);

beforeEach(() => {
  Object.assign(fs, { asks: 0, reachable: false, server: { seededAt: undefined, profiles: 0, lists: 0 } });
  Object.assign(store, { commits: 0, marks: [], confirmed: false });
  s.data.profiles.value = [];
  s.data.lists.value = [];
  setSettings({});
  s.householdId.value = 'h1';
});
afterEach(() => vi.useRealTimers());

describe('first-run seed', () => {
  it('asks the server again within a few seconds once the first ask fails', async () => {
    vi.useFakeTimers();
    const seeding = seedIfEmpty();
    await vi.advanceTimersByTimeAsync(0);
    // One ask reads the settings, profiles and lists.
    expect(fs.asks).toBe(3);
    expect(store.commits).toBe(0);

    // The server answers from now on.
    fs.reachable = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fs.asks).toBe(6);
    expect(store.commits).toBe(1);
    await seeding;
  });

  it('marks a household with only its Grocery List as seeded and writes nothing else', async () => {
    s.data.lists.value = [{ id: 'grocery' } as never];
    await seedIfEmpty();
    expect(store.marks).toEqual([{ seededAt: expect.any(Number) }]);
    expect(store.commits).toBe(0);
    expect(fs.asks).toBe(0);
  });

  it('leaves a household marked seeded alone, even emptied', async () => {
    setSettings({ seededAt: 1 });
    store.confirmed = true;
    await seedIfEmpty();
    expect(store.marks).toEqual([]);
    expect(store.commits).toBe(0);
  });

  it('does not seed from a cold cache when the server has the list', async () => {
    fs.reachable = true;
    fs.server.lists = 1;
    await seedIfEmpty();
    expect(store.commits).toBe(0);
  });

  it('does not seed a household the server says was seeded, though it is empty now', async () => {
    fs.reachable = true;
    fs.server.seededAt = 1;
    await seedIfEmpty();
    expect(store.commits).toBe(0);
  });

  it('does not seed once the tablet has switched household while it waited', async () => {
    vi.useFakeTimers();
    const seeding = seedIfEmpty();
    await vi.advanceTimersByTimeAsync(0);
    s.householdId.value = 'h2';
    fs.reachable = true;
    await vi.advanceTimersByTimeAsync(5_000);
    await seeding;
    expect(store.commits).toBe(0);
  });
});
