import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Firestore ends a listener for good when it errors. The store must not
 * stay "loading" forever or go silently stale: it reports the failure and
 * listens again. Firestore is replaced by a stub that hands the test each
 * listener's callbacks.
 */

interface Sub {
  path: string;
  next: (snap: unknown) => void;
  error: (e: unknown) => void;
  closed: boolean;
}
const subs: Sub[] = [];
/** Snapshots-in-sync callbacks waiting for Firestore to report every live listener has the latest writes. */
const inSync = vi.hoisted(() => [] as (() => void)[]);

vi.mock('../../src/data/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const ref = (_db: unknown, ...path: string[]) => ({ path: path.join('/'), id: 'x' });
  return {
    collection: ref,
    doc: ref,
    query: (q: object) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    increment: (n: number) => n,
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    writeBatch: vi.fn(),
    onSnapshotsInSync: (_db: unknown, cb: () => void) => {
      inSync.push(cb);
      return () => {};
    },
    onSnapshot: (q: { path: string }, next: Sub['next'], error: Sub['error']) => {
      const sub: Sub = { path: q.path, next, error, closed: false };
      subs.push(sub);
      return () => (sub.closed = true);
    },
  };
});

const { closeHousehold, loadError, openHousehold, ready, settings, whenShown } = await import('../../src/data/store');

const live = () => subs.filter((s) => !s.closed);
const empty = { docs: [], metadata: { fromCache: false } };
const settingsDoc = { exists: () => true, data: () => ({ idleHomeMinutes: 5 }), metadata: { fromCache: false } };
const deliver = (sub: Sub) => sub.next(sub.path.endsWith('settings/main') ? settingsDoc : empty);

describe('store listeners', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subs.length = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    closeHousehold();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reports a listener that fails before the household loads, then listens again', () => {
    openHousehold('h1');
    const [failing, ...rest] = live();
    rest.forEach(deliver);
    failing.error(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    expect(ready.value).toBe(false);
    expect(loadError.value).toBe('Missing or insufficient permissions.');

    vi.advanceTimersByTime(30_000);
    const again = live().filter((s) => s.path === failing.path && s !== failing);
    expect(again).toHaveLength(1);
    deliver(again[0]);
    expect(ready.value).toBe(true);
    expect(loadError.value).toBeNull();
  });

  it('keeps a settings listener alive after it fails on a loaded wall', () => {
    openHousehold('h1');
    live().forEach(deliver);
    expect(settings.value.idleHomeMinutes).toBe(5);
    const s = live().find((x) => x.path.endsWith('settings/main'))!;
    s.error(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    vi.advanceTimersByTime(30_000);
    expect(live().filter((x) => x.path.endsWith('settings/main') && x !== s)).toHaveLength(1);
  });

  it('does not resubscribe for a household that was closed meanwhile', () => {
    openHousehold('h1');
    const first = live()[0];
    first.error(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    closeHousehold();
    vi.advanceTimersByTime(30_000);
    expect(live()).toHaveLength(0);
  });

  it('says a write is shown only once no listener is down', () => {
    openHousehold('h1');
    live().forEach(deliver);
    const shown = vi.fn();
    whenShown(shown);
    inSync.splice(0).forEach((cb) => cb());
    expect(shown).toHaveBeenCalledOnce();

    // The task states listener fails and waits to listen again. A check-off made now is not in the store,
    // though Firestore reports every live listener in sync.
    const states = live().find((s) => s.path.endsWith('/taskStates'))!;
    states.error(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    const later = vi.fn();
    whenShown(later);
    inSync.splice(0).forEach((cb) => cb());
    expect(later).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(later).not.toHaveBeenCalled();
    // Back, with a first snapshot that has the write.
    deliver(live().find((s) => s.path.endsWith('/taskStates'))!);
    expect(later).toHaveBeenCalledOnce();
    deliver(live().find((s) => s.path.endsWith('/taskStates'))!);
    expect(later).toHaveBeenCalledOnce();
  });

  it('drops a pending retry when the same household is opened again (signed out and back in)', () => {
    openHousehold('h1');
    const n = live().length;
    live()[0].error(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    closeHousehold();
    openHousehold('h1');
    expect(live()).toHaveLength(n);
    vi.advanceTimersByTime(30_000);
    // One listener per collection, and every one of them closes with the household.
    expect(live()).toHaveLength(n);
    closeHousehold();
    expect(live()).toHaveLength(0);
  });
});
