import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coming back from Google's consent page (session.ts finishRedirect): the
 * page decides between a first sign-in and a reconnect by who is signed in
 * once Auth has restored, and Calendar token requests wait for the code
 * exchange, which brings the new connection's token. A token request still
 * on its way when the household disconnects answers for the connection
 * before, and caches nothing.
 */

const auth = vi.hoisted(() => ({
  currentUser: null as { uid: string } | null,
  authStateReady: async () => {},
}));
vi.mock('../../src/data/firebase', () => ({ auth, functions: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: () => () => {},
  signInWithCustomToken: vi.fn(async () => void (auth.currentUser = { uid: 'gNew' })),
  signOut: vi.fn(async () => void (auth.currentUser = null)),
}));
vi.mock('../../src/data/store', () => ({ openHousehold: () => {}, closeHousehold: () => {}, householdId: { peek: () => null } }));

/** The Functions calls in flight, by name, answered by the test. */
const calls = vi.hoisted(
  () => [] as { name: string; data: unknown; resolve: (data: unknown) => void; reject: (e: unknown) => void }[],
);
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => (data: unknown) =>
    new Promise((resolve, reject) => calls.push({ name, data, resolve: (d) => resolve({ data: d }), reject })),
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {} });
vi.stubGlobal('matchMedia', () => ({ matches: false }));
const replaced: string[] = [];
vi.stubGlobal('history', { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) });
const loc = { search: '', href: 'https://home.example.com/' };
vi.stubGlobal('location', loc);

const { disconnect, googleAccessToken, googleBusy, googleProblem, initSession, reconnectNote, session } =
  await import('../../src/data/session');

const later = Date.now() + 3_600_000;
const settle = () => new Promise((r) => setTimeout(r, 0));
const answer = (name: string) => {
  const i = calls.findIndex((c) => c.name === name);
  expect(i, `a ${name} call`).toBeGreaterThanOrEqual(0);
  return calls.splice(i, 1)[0];
};

/** This page loads as Google's return for a request this device made. */
function returnFromGoogle(query = 'state=manwar-s1&code=4%2Fc1&scope=x') {
  storage.set('manwar.googleRedirect.v1', JSON.stringify({ state: 'manwar-s1', verifier: 'ver-1', at: Date.now() }));
  loc.search = `?${query}`;
  initSession();
}

beforeEach(() => {
  calls.length = 0;
  replaced.length = 0;
  storage.clear();
  reconnectNote.value = null;
  googleProblem.value = null;
});

describe('coming back from Google', () => {
  it('reconnects a signed-in wall in place: the token request waits for the exchange, and a toast says so', async () => {
    auth.currentUser = { uid: 'gOld' };
    session.value = { state: 'signedIn', account: 'old' };
    googleProblem.value = 'Google access was revoked.';
    returnFromGoogle();
    await settle();
    expect(googleBusy.value).toBe(true);
    // The calendar sync starts from the cache meanwhile; its token request waits.
    const token = googleAccessToken();
    const exchange = answer('connectGoogle');
    expect(exchange.data).toEqual({
      code: '4/c1',
      codeVerifier: 'ver-1',
      redirectUri: expect.stringMatching(/^https:\/\/.+\/__\/auth\/handler$/),
    });
    expect(session.value.state).toBe('signedIn');
    exchange.resolve({ customToken: 't', accessToken: 'new-token', expiresAt: later, account: 'new' });
    expect(await token).toBe('new-token');
    await settle();
    expect(calls).toEqual([]);
    expect(session.value).toEqual({ state: 'signedIn', account: 'new' });
    expect(reconnectNote.value).toBe('Google Calendar is connected again.');
    expect(googleProblem.value).toBeNull();
    expect(googleBusy.value).toBe(false);
    // The code is gone from the address and the request from storage.
    expect(replaced).toEqual(['/']);
    expect(storage.size).toBe(0);
  });

  it('keeps the wall on screen when a reconnect fails, and says why in the toast', async () => {
    auth.currentUser = { uid: 'gOld' };
    session.value = { state: 'signedIn', account: 'old' };
    returnFromGoogle();
    await settle();
    answer('connectGoogle').reject(
      Object.assign(new Error('Manwar needs to see and edit your calendars.'), { code: 'functions/failed-precondition' }),
    );
    await settle();
    expect(session.value.state).toBe('signedIn');
    expect(reconnectNote.value).toContain('Manwar needs to see and edit your calendars.');
    expect(googleBusy.value).toBe(false);
  });

  it('says on the sign-in screen why a first sign-in did not finish', async () => {
    auth.currentUser = null;
    session.value = { state: 'loading' };
    returnFromGoogle('state=manwar-s1&error=access_denied');
    await settle();
    expect(calls).toEqual([]);
    expect(session.value).toEqual({ state: 'error', error: 'Google sign-in was cancelled.' });
    expect(reconnectNote.value).toBeNull();
  });

  it("leaves another tab's request in place when a return does not answer this one", async () => {
    auth.currentUser = null;
    session.value = { state: 'loading' };
    storage.set('manwar.googleRedirect.v1', JSON.stringify({ state: 'manwar-other', verifier: 'v', at: Date.now() }));
    loc.search = '?state=manwar-s1&code=x';
    initSession();
    await settle();
    expect(calls).toEqual([]);
    expect(session.value.state).toBe('error');
    expect(storage.has('manwar.googleRedirect.v1')).toBe(true);
  });
});

describe('a token request across a disconnect', () => {
  it('answers whoever asked, and caches nothing for the connection after', async () => {
    loc.search = '';
    auth.currentUser = { uid: 'gOld' };
    session.value = { state: 'signedIn', account: 'old' };
    vi.useFakeTimers({ now: later * 2 });
    const before = googleAccessToken();
    vi.useRealTimers();
    await disconnect();
    const revoked = Object.assign(new Error('Google access was revoked. Connect again. [400]'), {
      code: 'functions/failed-precondition',
    });
    answer('googleAccessToken').reject(revoked);
    await expect(before).rejects.toThrow('Google access was revoked');
    // Not this connection's problem.
    expect(googleProblem.value).toBeNull();
    await expect(googleAccessToken()).rejects.toThrow('Not signed in.');
  });
});
