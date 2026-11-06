import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Firestore ends a listener for good when it errors. The store must not
 * stay "loading" forever or go silently stale: it reports the failure and
 * listens again. Firestore is replaced by a stub that hands the test each
 * listener's callbacks.
 */

interface Sub {
  path: string;
  /** The value of a where('date', '>=', ...) on the query. */
  since?: string;
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
    query: (q: object, ...constraints: { since?: string }[]) => ({ ...q, since: constraints.find((c) => c.since)?.since }),
    where: (_field: string, _op: string, since: string) => ({ since }),
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
    onSnapshot: (q: { path: string; since?: string }, _opts: object, next: Sub['next'], error: Sub['error']) => {
      // docChanges(), as Firestore gives it: what differs from the last snapshot this listener saw.
      let last: string | null = null;
      const withChanges: Sub['next'] = (snap) => {
        const s = snap as { docs?: { data: () => unknown }[] };
        const now = JSON.stringify((s.docs ?? []).map((d) => d.data()));
        const changes = now === last ? [] : (s.docs ?? []).length ? s.docs! : [{}];
        last = now;
        return next({ ...(snap as object), docChanges: () => changes } as never);
      };
      const sub: Sub = { path: q.path, since: q.since, next: withChanges, error, closed: false };
      subs.push(sub);
      return () => (sub.closed = true);
    },
  };
});

const { closeHousehold, confirmedByServer, data, loadError, openHousehold, ready, settings, whenConfirmed, whenShown } =
  await import('../../src/data/store');
const { nowMs, today } = await import('../../src/lib/clock');
const { addDays } = await import('../../src/lib/date');

const live = () => subs.filter((s) => !s.closed);
const empty = { docs: [], metadata: { fromCache: false } };
const settingsDoc = { exists: () => true, data: () => ({ idleHomeMinutes: 5 }), metadata: { fromCache: false } };
const noDoc = { exists: () => false, data: () => undefined, metadata: { fromCache: false } };
// The settings document, the prayer clock's settings document (none yet), or a collection.
const deliver = (sub: Sub) =>
  sub.next(sub.path.endsWith('settings/main') ? settingsDoc : sub.path.endsWith('settings/prayer') ? noDoc : empty);

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

  it('says a write is shown only once none of its listeners is down', () => {
    openHousehold('h1');
    live().forEach(deliver);
    const shown = vi.fn();
    whenShown(['taskStates', 'ledger'], shown);
    inSync.splice(0).forEach((cb) => cb());
    expect(shown).toHaveBeenCalledOnce();

    // The task states listener fails and waits to listen again. A check-off made now is not in the store,
    // though Firestore reports every live listener in sync.
    const states = live().find((s) => s.path.endsWith('/taskStates'))!;
    states.error(Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' }));
    const later = vi.fn();
    whenShown(['taskStates', 'ledger'], later);
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

  it('does not hold a write on a listener that shows none of it', () => {
    openHousehold('h1');
    live().forEach(deliver);
    // The messages listener is down: a check-off is still shown by the task states and ledger.
    live()
      .find((s) => s.path.endsWith('/messages'))!
      .error(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    expect(loadError.value).toBe('Missing or insufficient permissions.');
    const shown = vi.fn();
    whenShown(['taskStates', 'ledger'], shown);
    inSync.splice(0).forEach((cb) => cb());
    expect(shown).toHaveBeenCalledOnce();
  });

  it('moves the task states window at the day change without showing less in between', () => {
    openHousehold('h1');
    live().forEach(deliver);
    const statesSub = () => live().filter((s) => s.path.endsWith('/taskStates'));
    const [first] = statesSub();
    const t0 = today.value;
    expect(first.since).toBe(addDays(t0, -62));
    const doc = (id: string) => ({ data: () => ({ id }) });
    first.next({ docs: [doc('a'), doc('b')], metadata: { fromCache: false } });

    // Midnight on a wall that never reloads.
    vi.setSystemTime(Date.now() + 86_400_000);
    nowMs.value = Date.now();
    const [old, moved] = statesSub();
    expect([old, moved?.since]).toEqual([first, addDays(t0, -61)]);
    // Until the new query answers, the old one still shows the states.
    expect(data.taskStates.value.map((s) => s.id)).toEqual(['a', 'b']);
    old.next({ docs: [doc('a'), doc('b'), doc('c')], metadata: { fromCache: false } });
    expect(data.taskStates.value).toHaveLength(3);
    moved.next({ docs: [doc('b'), doc('c')], metadata: { fromCache: true } });
    expect(data.taskStates.value.map((s) => s.id)).toEqual(['b', 'c']);
    expect(statesSub()).toEqual([moved]);
    // A snapshot the old one had in flight is dropped.
    old.next({ docs: [doc('a')], metadata: { fromCache: false } });
    expect(data.taskStates.value.map((s) => s.id)).toEqual(['b', 'c']);
    closeHousehold();
    nowMs.value = Date.now() + 86_400_000;
    expect(live()).toHaveLength(0);
  });

  it('says when the server has answered for collections, not a cache that was cold or stale', async () => {
    openHousehold('h1');
    const done = vi.fn();
    void whenConfirmed(['settings', 'listItems']).then(done);
    const fromCache = (s: Sub) =>
      s.next(
        s.path.endsWith('settings/main')
          ? { ...settingsDoc, metadata: { fromCache: true } }
          : s.path.endsWith('settings/prayer')
            ? { ...noDoc, metadata: { fromCache: true } }
            : { docs: [], metadata: { fromCache: true } },
      );
    live().forEach(fromCache);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    expect(confirmedByServer('listItems')).toBe(false);
    // The server answers, unchanged: the snapshot only says where it came from.
    deliver(live().find((s) => s.path.endsWith('/listItems'))!);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    deliver(live().find((s) => s.path.endsWith('settings/main'))!);
    await Promise.resolve();
    expect(done).toHaveBeenCalledOnce();
    expect(confirmedByServer('listItems')).toBe(true);
    await expect(whenConfirmed(['listItems'])).resolves.toBeUndefined();
    closeHousehold();
    expect(confirmedByServer('listItems')).toBe(false);
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
