import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A first run seeds only once the server confirms the household is empty.
 * While Firestore counts itself offline (a first answer slower than its
 * 10 s allowance), asking fails at once, and the server's later answer
 * raises no new snapshot for an unchanged empty result, so seeding waits
 * on the next ask: it must come within seconds, not a long period.
 */

const fs = vi.hoisted(() => ({ asks: 0, reachable: false }));
vi.mock('firebase/firestore', () => ({
  limit: () => ({}),
  query: (q: object) => q,
  getDocsFromServer: async () => {
    fs.asks++;
    if (!fs.reachable) throw new Error('Failed to get documents from server.');
    return { empty: true };
  },
  getDocFromServer: async () => {
    fs.asks++;
    if (!fs.reachable) throw new Error('Failed to get document from server.');
    return { get: () => undefined };
  },
}));

const commits = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/data/store', async () => {
  const { signal } = await import('@preact/signals');
  const batch = () => {
    const api = { put: () => api, settings: () => api, commit: async () => void commits.n++ };
    return api;
  };
  return {
    batch,
    colRef: () => ({}),
    confirmedByServer: () => false,
    data: { profiles: signal([]), lists: signal([]) },
    householdId: signal('h1'),
    newId: () => 'id',
    saveSettings: async () => {},
    settings: signal({}),
    settingsRef: () => ({}),
  };
});
vi.mock('../../src/calendar/engine', () => ({ metaKey: (c: string, id: string) => `${c}::${id}` }));

const { seedIfEmpty } = await import('../../src/data/seed');

afterEach(() => vi.useRealTimers());

describe('first-run seed', () => {
  it('asks the server again within a few seconds once the first ask fails', async () => {
    vi.useFakeTimers();
    const seeding = seedIfEmpty();
    await vi.advanceTimersByTimeAsync(0);
    // One ask reads the settings, profiles and lists.
    expect(fs.asks).toBe(3);
    expect(commits.n).toBe(0);

    // The server answers from now on.
    fs.reachable = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fs.asks).toBe(6);
    expect(commits.n).toBe(1);
    await seeding;
  });
});
