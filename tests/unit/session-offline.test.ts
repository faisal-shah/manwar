import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Starting while offline: the auth state arrives from persistence, but its
 * ID token has expired and cannot be refreshed. The household must still
 * open (on cached data) with the claims of the last sign-in.
 */

const auth = vi.hoisted(() => ({ listener: null as null | ((u: unknown) => Promise<void>) }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => Promise<void>) => (auth.listener = cb),
  signInWithCustomToken: vi.fn(),
  signOut: vi.fn(async () => {}),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../../src/data/firebase', () => ({ auth: {}, functions: {} }));
const opened = vi.hoisted(() => [] as string[]);
vi.mock('../../src/data/store', () => ({ openHousehold: (h: string) => opened.push(h), closeHousehold: () => {} }));

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
vi.stubGlobal('location', { search: '' });
const online = vi.hoisted(() => ({ listeners: [] as (() => void)[] }));
vi.stubGlobal('window', {
  addEventListener: (_t: string, fn: () => void) => online.listeners.push(fn),
  removeEventListener: (_t: string, fn: () => void) => (online.listeners = online.listeners.filter((f) => f !== fn)),
});

const { initSession, session } = await import('../../src/data/session');
initSession();

const user = (uid: string, claims: Record<string, unknown> | Error) => ({
  uid,
  getIdTokenResult: async () => {
    if (claims instanceof Error) throw claims;
    return { claims };
  },
});
const offline = Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), {
  code: 'auth/network-request-failed',
});

beforeEach(() => {
  opened.length = 0;
  session.value = { state: 'loading' };
});

describe('session start', () => {
  it('opens the household from the token claims and remembers them', async () => {
    await auth.listener!(user('u1', { hid: 'g123', account: 'family@example.com' }));
    expect(opened).toEqual(['g123']);
    expect(session.value).toEqual({ state: 'signedIn', account: 'family@example.com' });
  });

  it('opens the last household when the token cannot be refreshed offline', async () => {
    await auth.listener!(user('u1', { hid: 'g123', account: 'family@example.com' }));
    opened.length = 0;
    await auth.listener!(user('u1', offline));
    expect(opened).toEqual(['g123']);
    expect(session.value.state).toBe('signedIn');
  });

  it('does not lend one user the claims of another: it waits for the network instead', async () => {
    await auth.listener!(user('u1', { hid: 'g123' }));
    opened.length = 0;
    await auth.listener!(user('u2', offline));
    expect(opened).toEqual([]);
    expect(session.value.state).toBe('waiting');
  });

  it('signs out with a message when the sign-in itself is refused', async () => {
    const refused = Object.assign(new Error('Firebase: Error (auth/user-token-expired).'), {
      code: 'auth/user-token-expired',
    });
    await auth.listener!(user('u1', { hid: 'g123' }));
    opened.length = 0;
    await auth.listener!(user('u1', refused));
    expect(opened).toEqual([]);
    expect(session.value).toEqual({ state: 'error', error: 'The sign-in expired. Connect the Google account again.' });
  });

  it('keeps the sign-in through a server error on the token refresh', async () => {
    // Auth names a JSON server error after its message (a 503 "The service is currently unavailable.").
    const busy = ['auth/too-many-requests', 'auth/internal-error', 'auth/the-service-is-currently-unavailable.'];
    await auth.listener!(user('u1', { hid: 'g123' }));
    for (const code of busy) {
      opened.length = 0;
      await auth.listener!(user('u1', Object.assign(new Error(`Firebase: Error (${code}).`), { code })));
      expect(opened, code).toEqual(['g123']);
      expect(session.value.state, code).toBe('signedIn');
    }
    // With nothing remembered for the user, it waits and asks again rather than signing out.
    opened.length = 0;
    await auth.listener!(user('u3', Object.assign(new Error('Firebase: Error (auth/internal-error).'), { code: 'auth/internal-error' })));
    expect(opened).toEqual([]);
    expect(session.value.state).toBe('waiting');
  });
});
