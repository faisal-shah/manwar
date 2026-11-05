import { describe, expect, it, vi } from 'vitest';

/**
 * Google access tokens across a reconnect to another account. A token
 * request is a Functions call made as the signed-in household; one still on
 * its way when the tablet connects another account answers for the account
 * before, and must not replace the new account's token.
 */

const auth = vi.hoisted(() => ({ currentUser: { uid: 'gOld' } as { uid: string } | null }));
vi.mock('../../src/data/firebase', () => ({ auth, functions: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: () => () => {},
  signInWithCustomToken: vi.fn(async () => void (auth.currentUser = { uid: 'gNew' })),
  signOut: vi.fn(async () => {}),
}));
vi.mock('../../src/data/store', () => ({ openHousehold: () => {}, closeHousehold: () => {} }));

/** The Functions calls in flight, by name, answered by the test. */
const calls = vi.hoisted(() => [] as { name: string; resolve: (data: unknown) => void; reject: (e: unknown) => void }[]);
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => () =>
    new Promise((resolve, reject) => calls.push({ name, resolve: (data) => resolve({ data }), reject })),
}));

/** Google's popup, answering with a code at once. */
const code = vi.hoisted(() => ({ callback: null as null | ((r: { code: string }) => void) }));
vi.stubGlobal('window', {
  google: {
    accounts: {
      oauth2: {
        initCodeClient: (c: { callback: (r: { code: string }) => void }) => ({
          requestCode: () => (code.callback = c.callback),
        }),
      },
    },
  },
});
vi.stubGlobal('location', { search: '' });

const { googleAccessToken, googleProblem, session, startGoogleConnect } = await import('../../src/data/session');

const later = Date.now() + 3_600_000;
const settle = () => new Promise((r) => setTimeout(r, 0));
const answer = (name: string) => {
  const i = calls.findIndex((c) => c.name === name);
  return calls.splice(i, 1)[0];
};

describe('Google access token across a reconnect', () => {
  it('keeps the new account’s token when a request made before the reconnect answers after it', async () => {
    session.value = { state: 'signedIn', account: 'old' };
    const before = googleAccessToken();
    // Connected again as another account while that request is on its way.
    startGoogleConnect();
    code.callback!({ code: 'c' });
    await settle();
    answer('connectGoogle').resolve({ customToken: 't', accessToken: 'new-token', expiresAt: later, account: 'new' });
    await settle();
    expect(auth.currentUser?.uid).toBe('gNew');
    answer('googleAccessToken').resolve({ accessToken: 'old-token', expiresAt: later });
    // Whoever asked before the reconnect gets the old account's token; the wall from now on gets the new one.
    expect(await before).toBe('old-token');
    expect(await googleAccessToken()).toBe('new-token');
    expect(calls).toEqual([]);
  });

  it('does not ask for a reconnect because of the account connected before', async () => {
    session.value = { state: 'signedIn', account: 'new' };
    auth.currentUser = { uid: 'gOld' };
    // A request that needs a fresh token: make the cached one expire.
    vi.useFakeTimers({ now: later });
    const before = googleAccessToken();
    vi.useRealTimers();
    startGoogleConnect();
    code.callback!({ code: 'c' });
    await settle();
    answer('connectGoogle').resolve({ customToken: 't', accessToken: 'new-token-2', expiresAt: later * 2, account: 'new' });
    await settle();
    // The old account's access was revoked, which is why the household connected again.
    const revoked = Object.assign(new Error('Google access was revoked. Connect again. [400]'), {
      code: 'functions/failed-precondition',
    });
    answer('googleAccessToken').reject(revoked);
    await expect(before).rejects.toThrow('Google access was revoked');
    expect(googleProblem.value).toBeNull();
    expect(await googleAccessToken()).toBe('new-token-2');
  });
});
