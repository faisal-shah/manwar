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

  it('does not lend one user the claims of another', async () => {
    await auth.listener!(user('u1', { hid: 'g123' }));
    opened.length = 0;
    await expect(auth.listener!(user('u2', offline))).rejects.toThrow('network-request-failed');
    expect(opened).toEqual([]);
  });
});
