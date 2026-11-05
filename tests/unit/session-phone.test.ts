import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A paired phone's session: the last-seen stamp it keeps on its devices/
 * document while the page stays open for days, and the reason it gives
 * when Auth drops its sign-in on its own (removed while offline, so the
 * device watch never heard of it) rather than through an unpair here.
 */

const auth = vi.hoisted(() => ({ listener: null as null | ((u: unknown) => Promise<void>) }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => Promise<void>) => (auth.listener = cb),
  signInWithCustomToken: vi.fn(),
  // Signing out here raises the auth event, as Auth does.
  signOut: vi.fn(async () => auth.listener!(null)),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: () => async () => ({ data: {} }) }));
vi.mock('../../src/data/firebase', () => ({ auth: {}, db: {}, functions: {} }));

type Snap = { exists: () => boolean; get: (f: string) => unknown; metadata: { fromCache: boolean } };
const fs = vi.hoisted(() => ({
  next: null as null | ((s: Snap) => void),
  stamps: [] as number[],
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: (_ref: unknown, next: (s: Snap) => void) => {
    fs.next = next;
    return () => (fs.next = null);
  },
  updateDoc: async (_ref: unknown, d: { lastSeenAt: number }) => void fs.stamps.push(d.lastSeenAt),
}));
vi.mock('../../src/data/store', async () => {
  const { signal } = await import('@preact/signals');
  const householdId = signal<string | null>(null);
  return {
    householdId,
    openHousehold: (h: string) => (householdId.value = h),
    closeHousehold: () => (householdId.value = null),
  };
});
const activity = vi.hoisted(() => ({ fns: [] as (() => void)[] }));
vi.mock('../../src/core/activity', () => ({
  onActivity: (fn: () => void) => {
    activity.fns.push(fn);
    return () => (activity.fns = activity.fns.filter((f) => f !== fn));
  },
}));

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
vi.stubGlobal('location', { search: '' });
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
const page = vi.hoisted(() => ({ visibility: 'visible', shown: [] as (() => void)[] }));
vi.stubGlobal('document', {
  get visibilityState() {
    return page.visibility;
  },
  addEventListener: (_t: string, fn: () => void) => page.shown.push(fn),
  removeEventListener: (_t: string, fn: () => void) => (page.shown = page.shown.filter((f) => f !== fn)),
});

const { disconnect, initSession, session, unpairPhone } = await import('../../src/data/session');
initSession();

const HOUR = 60 * 60_000;
const START = new Date('2026-11-04T08:00').getTime();
const phoneUser = { uid: 'g1.phone.d1', getIdTokenResult: async () => ({ claims: { hid: 'g1', device: 'd1' } }) };
const wallUser = { uid: 'g1', getIdTokenResult: async () => ({ claims: { hid: 'g1', account: 'family@example.com' } }) };
const snap = (lastSeenAt: number): Snap => ({
  exists: () => true,
  get: () => lastSeenAt,
  metadata: { fromCache: false },
});
const show = () => page.shown.forEach((f) => f());
const touch = () => activity.fns.forEach((f) => f());
const REMOVED = 'This phone was removed from the household. Pair it again from the wall.';

beforeEach(async () => {
  vi.useFakeTimers({ now: START, toFake: ['Date'] });
  fs.stamps.length = 0;
  page.visibility = 'visible';
  session.value = { state: 'loading' };
  await auth.listener!(null);
});

describe("a phone's last-seen stamp", () => {
  it('is stamped on opening, and again when shown or touched once an hour has passed', async () => {
    await auth.listener!(phoneUser);
    expect(session.value).toEqual({ state: 'signedIn', device: 'd1' });
    fs.next!(snap(START - 2 * HOUR));
    expect(fs.stamps).toEqual([START]);
    // The write's own snapshot, and use within the hour: nothing more.
    fs.next!(snap(START));
    vi.setSystemTime(START + HOUR / 2);
    show();
    touch();
    expect(fs.stamps).toEqual([START]);
    // A day later, the page still open: brought back to the screen, then touched.
    vi.setSystemTime(START + 24 * HOUR);
    page.visibility = 'hidden';
    show();
    expect(fs.stamps).toEqual([START]);
    page.visibility = 'visible';
    show();
    touch();
    expect(fs.stamps).toEqual([START, START + 24 * HOUR]);
    vi.setSystemTime(START + 25 * HOUR + 1);
    touch();
    expect(fs.stamps).toEqual([START, START + 24 * HOUR, START + 25 * HOUR + 1]);
  });

  it('stops with the sign-out', async () => {
    await auth.listener!(phoneUser);
    fs.next!(snap(START));
    await disconnect();
    vi.setSystemTime(START + 2 * HOUR);
    show();
    touch();
    expect(fs.stamps).toEqual([]);
    expect(page.shown).toEqual([]);
    expect(activity.fns).toEqual([]);
  });
});

describe('a phone signed out', () => {
  it('by Auth on its own (its sign-in refused on a refresh) says it was removed', async () => {
    await auth.listener!(phoneUser);
    await auth.listener!(null);
    expect(session.value).toEqual({ state: 'error', error: REMOVED });
  });

  it('by unpairing here shows the pairing screen without a reason', async () => {
    await auth.listener!(phoneUser);
    await unpairPhone();
    expect(session.value).toEqual({ state: 'signedOut' });
  });

  it('when the wall removes it says it was removed, as before', async () => {
    await auth.listener!(phoneUser);
    fs.next!({ exists: () => false, get: () => undefined, metadata: { fromCache: false } });
    await vi.waitFor(() => expect(session.value).toEqual({ state: 'error', error: REMOVED }));
  });

  it("a wall's sign-in dropped by Auth is a plain sign-out", async () => {
    await auth.listener!(wallUser);
    await auth.listener!(null);
    expect(session.value).toEqual({ state: 'signedOut' });
  });
});
