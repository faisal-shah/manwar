import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile, Task } from '../../src/data/types';

/**
 * The task write guard: a second write for the same occurrence before the
 * store shows the first is refused, and the keys are free again once the
 * store says it shows the write (whenShown, tested with the store). A
 * circle tap never gets here twice (tapCheck drops the rest of a double
 * tap), so this drives the writes directly against an in-memory store
 * whose snapshot lags, as Firestore's does.
 */

const sync = vi.hoisted(() => ({ waiting: [] as (() => void)[] }));
vi.mock('firebase/firestore', () => ({ deleteField: () => 'DELETE' }));

const commits = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/data/store', async () => {
  const { computed, signal } = await import('@preact/signals');
  const data = {
    tasks: signal<Task[]>([]),
    taskStates: signal<unknown[]>([]),
    ledger: signal<unknown[]>([]),
    rewards: signal<unknown[]>([]),
  };
  // The profile the stars go to must exist (a check-off for a deleted one is refused).
  const profiles = signal<Profile[]>([{ id: 'kid', name: 'Kid', color: '#888', order: 0, createdAt: 0, stars: 0 } as Profile]);
  const profileById = computed(() => new Map(profiles.value.map((p) => [p.id, p])));
  const batch = () => {
    const api = {
      put: () => api,
      patch: () => api,
      remove: () => api,
      stars: () => api,
      commit: async () => void commits.n++,
    };
    return api;
  };
  let id = 0;
  const whenShown = (done: () => void) => void sync.waiting.push(done);
  return { data, profiles, profileById, batch, whenShown, newId: () => `id${++id}` };
});

const { completeTask, occurrencesFor } = await import('../../src/tasks/state');
const { data } = await import('../../src/data/store');
const { today } = await import('../../src/lib/clock');

const task: Task = {
  id: 't1',
  kind: 'chore',
  title: 'Feed the cat',
  assignees: ['kid'],
  upForGrabs: false,
  stars: 2,
  date: today.value,
  order: 0,
  createdAt: 0,
};

/** The store shows the write. */
const inSync = () => sync.waiting.splice(0).forEach((cb) => cb());

describe('task write guard', () => {
  beforeEach(() => {
    data.tasks.value = [task];
    data.taskStates.value = [];
    sync.waiting.length = 0;
    commits.n = 0;
  });

  it('refuses a second check-off before the store shows the first, and frees the key once in sync', () => {
    const [o] = occurrencesFor(today.value);
    expect(completeTask(o, 'kid', today.value)).not.toBeNull();
    // The snapshot has not arrived: the state still reads open.
    expect(completeTask(o, 'kid', today.value)).toBeNull();
    expect(commits.n).toBe(1);

    // Shown, but the write did not stick (rejected and rolled back): the occurrence can be checked off again.
    inSync();
    expect(completeTask(o, 'kid', today.value)).not.toBeNull();
    expect(commits.n).toBe(2);
    inSync();
  });

  it('holds only the keys of the write in flight', () => {
    data.tasks.value = [task, { ...task, id: 't2', title: 'Water plants' }];
    const [a, b] = occurrencesFor(today.value);
    expect(completeTask(a, 'kid', today.value)).not.toBeNull();
    expect(completeTask(b, 'kid', today.value)).not.toBeNull();
    expect(commits.n).toBe(2);
    inSync();
  });
});
