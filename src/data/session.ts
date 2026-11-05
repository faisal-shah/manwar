import { signal } from '@preact/signals';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { demoMode, googleClientId, googleScopes } from '../config';
import { errorMessage, isNetworkError, needsReconnect } from './errors';
import { auth, functions } from './firebase';
import { closeHousehold, openHousehold } from './store';

/**
 * Who the tablet is signed in as. A household signs in once with Google's
 * popup code flow (Google Identity Services, redirect_uri 'postmessage', so
 * only the page origin has to be registered on the OAuth client); the
 * connectGoogle Function exchanges the code, keeps the refresh token
 * server-side and returns a Firebase custom token carrying the household id
 * (`hid` claim).
 *
 * 'waiting': signed in on this tablet, but the sign-in cannot be checked
 * until the network is back (and no household is remembered for it).
 */
export type SessionState = 'loading' | 'waiting' | 'signedOut' | 'connecting' | 'signedIn' | 'error';

export const session = signal<{ state: SessionState; account?: string; error?: string }>({ state: 'loading' });

/**
 * A Google problem only connecting again fixes (access revoked, the account
 * taken off the allowlist), from the last token request; null once a token
 * comes through.
 */
export const googleProblem = signal<string | null>(null);

interface ConnectResult {
  customToken: string;
  accessToken: string;
  expiresAt: number;
  account: string;
}

interface CodeResponse {
  code?: string;
  error?: string;
  error_description?: string;
}

interface GisOauth2 {
  initCodeClient(config: {
    client_id: string;
    scope: string;
    ux_mode: 'popup';
    select_account?: boolean;
    callback: (r: CodeResponse) => void;
    error_callback?: (e: { type: string }) => void;
  }): { requestCode(): void };
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GisOauth2 } };
  }
}

let gis: Promise<void> | null = null;

/** Load Google Identity Services ahead of the tap, so the popup opens inside the user gesture. */
function loadGis(): Promise<void> {
  gis ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gis = null;
      reject(new Error('Could not load Google sign-in. Check the connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return gis;
}

const fail = (error: string) => (session.value = { state: 'error', error });

interface ConnectOptions {
  /** After the account is connected (a reconnect while signed in). */
  onDone?: () => void;
  /** Report errors here instead of on the sign-in screen (a reconnect while signed in). */
  onError?: (message: string) => void;
}

/** Open Google's account chooser and consent popup. Must run in a tap handler. */
export function startGoogleConnect(opts: ConnectOptions = {}): void {
  const report = opts.onError ?? fail;
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    report('Google sign-in is still loading. Try again in a moment.');
    void loadGis().catch((e: Error) => report(e.message));
    return;
  }
  oauth2
    .initCodeClient({
      client_id: googleClientId,
      scope: googleScopes.join(' '),
      ux_mode: 'popup',
      callback: (r) => {
        if (r.code) void exchange(r.code, opts);
        else report(`Google sign-in did not finish (${r.error_description ?? r.error ?? 'no code'}).`);
      },
      error_callback: (e) =>
        report(
          e.type === 'popup_closed'
            ? 'The Google window was closed before finishing.'
            : 'The browser blocked the Google sign-in window.',
        ),
    })
    .requestCode();
}

const call = <Req, Res>(name: string) => httpsCallable<Req, Res>(functions, name);

/**
 * Trade the popup's code for a Firebase sign-in. A reconnect while signed in
 * keeps the wall on screen: the same account keeps its household (the auth
 * user does not change, so no auth event fires), another account switches
 * to its own household through the auth listener.
 */
async function exchange(code: string, opts: ConnectOptions): Promise<void> {
  const reconnecting = session.value.state === 'signedIn';
  if (!reconnecting) session.value = { state: 'connecting' };
  try {
    const res = await call<{ code: string }, ConnectResult>('connectGoogle')({ code });
    cacheToken(res.data.accessToken, res.data.expiresAt);
    googleProblem.value = null;
    await signInWithCustomToken(auth, res.data.customToken);
    if (reconnecting && session.value.state === 'signedIn') session.value = { ...session.value, account: res.data.account };
    opts.onDone?.();
  } catch (e) {
    (opts.onError ?? fail)(errorMessage(e));
  }
}

let token: { value: string; expiresAt: number } | null = null;
const cacheToken = (value: string, expiresAt: number) => (token = { value, expiresAt });
let tokenRequest: Promise<string> | null = null;

/**
 * A Google Calendar access token for the household, minted by the
 * googleAccessToken Function. Concurrent callers share one request. Errors
 * carry a message for people; the ones only a reconnect fixes also set
 * googleProblem.
 */
export function googleAccessToken(): Promise<string> {
  if (token && token.expiresAt - 60_000 > Date.now()) return Promise.resolve(token.value);
  if (!auth.currentUser) return Promise.reject(new Error('Not signed in.'));
  tokenRequest ??= (async () => {
    try {
      const res = await call<void, { accessToken: string; expiresAt: number }>('googleAccessToken')();
      cacheToken(res.data.accessToken, res.data.expiresAt);
      googleProblem.value = null;
      return res.data.accessToken;
    } catch (e) {
      if (needsReconnect(e)) googleProblem.value = errorMessage(e);
      throw new Error(errorMessage(e));
    } finally {
      tokenRequest = null;
    }
  })();
  return tokenRequest;
}

/**
 * Forget a token Google refused (401), so the next call asks for a new one.
 * The expiry comes from the server's clock; a tablet clock running behind
 * would otherwise keep using an expired token until its own clock caught up.
 */
export function dropGoogleToken(value: string): void {
  if (token?.value === value) token = null;
}

export async function disconnect(): Promise<void> {
  token = null;
  googleProblem.value = null;
  forgetHousehold();
  await signOut(auth);
}

/*
 * The household id rides in the ID token's claims. Reading them refreshes an
 * expired token, which fails offline: a tablet that boots before the Wi-Fi is
 * up would never open its household. So the last household opened is
 * remembered for its user and used when the claims cannot be refreshed.
 */
const HOUSEHOLD_KEY = 'manwar.claims.v1';

interface Household {
  uid: string;
  hid: string;
  account?: string;
}

function rememberHousehold(h: Household): void {
  try {
    localStorage.setItem(HOUSEHOLD_KEY, JSON.stringify(h));
  } catch {
    /* storage unavailable: an offline start waits for the network */
  }
}

function recallHousehold(uid: string): Household | null {
  try {
    const h = JSON.parse(localStorage.getItem(HOUSEHOLD_KEY) ?? 'null') as Household | null;
    return h?.uid === uid && typeof h.hid === 'string' ? h : null;
  } catch {
    return null;
  }
}

function forgetHousehold(): void {
  try {
    localStorage.removeItem(HOUSEHOLD_KEY);
  } catch {
    /* nothing remembered */
  }
}

/** The user's household from fresh claims, or the remembered one while the network is down; null without a hid claim. */
async function householdOf(user: User): Promise<Household | null> {
  try {
    const { claims } = await user.getIdTokenResult();
    if (typeof claims.hid !== 'string') return null;
    const h = { uid: user.uid, hid: claims.hid, account: typeof claims.account === 'string' ? claims.account : undefined };
    rememberHousehold(h);
    return h;
  } catch (e) {
    const h = isNetworkError(e) ? recallHousehold(user.uid) : null;
    if (h) return h;
    throw e;
  }
}

const RETRY_MS = 15_000;

/** Run `fn` once: when the browser reports the network back, or after RETRY_MS. */
function whenOnline(fn: () => void): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener('online', run);
    fn();
  };
  window.addEventListener('online', run);
  setTimeout(run, RETRY_MS);
}

/** `?demo=name` gives each demo (or test run) its own household in the emulator. */
const demoHousehold = `demo${new URLSearchParams(location.search).get('demo') ? `-${new URLSearchParams(location.search).get('demo')}` : ''}`;

/** The Auth emulator accepts unsigned custom tokens, so demo mode signs itself in. */
function demoToken(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'demo@demo-manwar.iam.gserviceaccount.com',
    sub: 'demo@demo-manwar.iam.gserviceaccount.com',
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat,
    exp: iat + 3600,
    uid: `demo-${demoHousehold}`,
    claims: { hid: demoHousehold, account: 'demo@manwar.local' },
  };
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

export function initSession(): void {
  if (!demoMode) void loadGis().catch(() => {});
  let seq = 0;
  onAuthStateChanged(auth, (user) => signedInAs(user, ++seq));

  async function signedInAs(user: User | null, n: number): Promise<void> {
    if (!user) {
      closeHousehold();
      if (session.value.state === 'connecting' || session.value.state === 'error') return;
      session.value = { state: 'signedOut' };
      if (demoMode) await signInWithCustomToken(auth, demoToken());
      return;
    }
    let h: Household | null;
    try {
      h = await householdOf(user);
    } catch (e) {
      if (n !== seq) return;
      if (isNetworkError(e)) {
        session.value = { state: 'waiting' };
        whenOnline(() => {
          if (n === seq && auth.currentUser) void signedInAs(auth.currentUser, n);
        });
        return;
      }
      // The sign-in itself was refused (revoked, disabled): connect again.
      fail('The sign-in expired. Connect the Google account again.');
      await signOut(auth);
      return;
    }
    if (n !== seq) return;
    if (!h) {
      await signOut(auth);
      return;
    }
    openHousehold(h.hid);
    session.value = { state: 'signedIn', account: h.account };
  }
}
