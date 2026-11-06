import { signal } from '@preact/signals';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { HOUSEHOLD_KEY } from './householdKey';
import { httpsCallable } from 'firebase/functions';
import { canonicalHost, demoMode, googleClientId, googleScopes } from '../config';
import { onActivity } from '../core/activity';
import { errorMessage, isSignInRefused, needsReconnect } from './errors';
import { auth, db, functions } from './firebase';
import { closeHousehold, householdId, openHousehold } from './store';
import { googleAuthUrl, readReturn, redirectUri, RETURN_PARAMS, STATE_PREFIX, type PendingRedirect } from './googleRedirect';

/**
 * Who the tablet is signed in as. A household signs in once with Google's
 * popup code flow (Google Identity Services, redirect_uri 'postmessage', so
 * only the page origin has to be registered on the OAuth client); the
 * connectGoogle Function exchanges the code, keeps the refresh token
 * server-side and returns a Firebase custom token carrying the household id
 * (`hid` claim).
 *
 * 'waiting': signed in on this tablet, but the sign-in cannot be checked
 * until the network (or Google's sign-in service) answers, and no household
 * is remembered for it.
 */
export type SessionState = 'loading' | 'waiting' | 'signedOut' | 'connecting' | 'signedIn' | 'error';

/**
 * `device`: the paired phone's id (Firestore `devices`), when this is one;
 * a wall signs in with the Google account itself and has none.
 */
export const session = signal<{ state: SessionState; account?: string; device?: string; error?: string }>({ state: 'loading' });

/** This page's device id when it is a paired phone (signed in), else null. */
export const pairedDevice = () => (session.value.state === 'signedIn' ? (session.value.device ?? null) : null);

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

/** Running as an installed app (Android's "Install app"), where Google's popup cannot report back. */
const installedApp = () => ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);

const REDIRECT_KEY = 'manwar.googleRedirect.v1';

/**
 * Open Google's account chooser and consent: a popup in a browser tab, a
 * redirect in an installed app (data/googleRedirect.ts; a reconnect then
 * reloads the wall, and its result shows on the page it comes back to).
 * Must run in a tap handler.
 */
export function startGoogleConnect(opts: ConnectOptions = {}): void {
  if (installedApp()) return void redirectToGoogle();
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

async function redirectToGoogle(): Promise<void> {
  // The return is answered by the service worker (googleRedirect.ts): without an active one, Firebase's
  // handler page would answer it instead.
  const sw = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (!sw?.active) {
    fail('The app is still installing itself. Try again in a moment.');
    return;
  }
  const pending: PendingRedirect = { state: `${STATE_PREFIX}${crypto.randomUUID()}`, at: Date.now() };
  try {
    localStorage.setItem(REDIRECT_KEY, JSON.stringify(pending));
  } catch {
    fail('This browser keeps no storage, so Google sign-in cannot come back to it.');
    return;
  }
  location.assign(googleAuthUrl(googleClientId, googleScopes, canonicalHost, pending.state));
}

/** Finish a sign-in that came back from Google (redirectToGoogle), once this page knows who is signed in. */
async function finishRedirect(): Promise<void> {
  let pending: PendingRedirect | null = null;
  try {
    pending = JSON.parse(localStorage.getItem(REDIRECT_KEY) ?? 'null') as PendingRedirect | null;
  } catch {
    /* nothing pending */
  }
  const back = readReturn(location.search, pending, Date.now());
  if (!back) return;
  try {
    localStorage.removeItem(REDIRECT_KEY);
  } catch {
    /* gone with the storage */
  }
  // The code is used once: the address no longer carries it (and is the app's own again, not the handler's).
  const url = new URL(location.href);
  url.pathname = '/';
  for (const k of RETURN_PARAMS) url.searchParams.delete(k);
  history.replaceState(history.state, '', url.href);
  await auth.authStateReady();
  if ('error' in back) {
    if (session.value.state === 'signedIn') googleProblem.value = back.error;
    else fail(back.error);
    return;
  }
  await exchange(back.code, {}, redirectUri(canonicalHost));
}

const call = <Req, Res>(name: string) => httpsCallable<Req, Res>(functions, name);

/**
 * Trade the popup's code for a Firebase sign-in. A reconnect while signed in
 * keeps the wall on screen: the same account keeps its household (the auth
 * user does not change, so no auth event fires), another account switches
 * to its own household through the auth listener.
 */
async function exchange(code: string, opts: ConnectOptions, redirect?: string): Promise<void> {
  const reconnecting = session.value.state === 'signedIn';
  if (!reconnecting) session.value = { state: 'connecting' };
  try {
    const res = await call<{ code: string; redirectUri?: string }, ConnectResult>('connectGoogle')({
      code,
      redirectUri: redirect,
    });
    newConnection();
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
 * Counts connections (a Google account connected, or disconnected). A
 * token request answers for the account connected when it was made: one
 * that answers after another connection neither caches its token nor
 * reports its problem.
 */
let connection = 0;

/** Another account (or none) from now on: forget its token and any request on its way. */
function newConnection(): void {
  connection++;
  token = null;
  tokenRequest = null;
}

/**
 * A Google Calendar access token for the household, minted by the
 * googleAccessToken Function. Concurrent callers share one request. Errors
 * carry a message for people; the ones only a reconnect fixes also set
 * googleProblem.
 */
export function googleAccessToken(): Promise<string> {
  if (token && token.expiresAt - 60_000 > Date.now()) return Promise.resolve(token.value);
  if (!auth.currentUser) return Promise.reject(new Error('Not signed in.'));
  if (tokenRequest) return tokenRequest;
  const asked = connection;
  const current = () => asked === connection;
  tokenRequest = (async () => {
    try {
      const res = await call<void, { accessToken: string; expiresAt: number }>('googleAccessToken')();
      if (current()) {
        cacheToken(res.data.accessToken, res.data.expiresAt);
        googleProblem.value = null;
      }
      return res.data.accessToken;
    } catch (e) {
      if (current() && needsReconnect(e)) googleProblem.value = errorMessage(e);
      throw new Error(errorMessage(e));
    } finally {
      // After another connection, tokenRequest is that connection's (or none).
      if (current()) tokenRequest = null;
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

/**
 * This page signed itself out since the last sign-in (disconnect, unpair, a
 * refused sign-in). Otherwise a sign-out came from Auth: it drops a sign-in
 * whose token refresh is refused, as a phone's is once it was removed
 * while offline (the device watch never heard the news).
 */
let signedOutHere = false;

function leave(): Promise<void> {
  signedOutHere = true;
  return signOut(auth);
}

export async function disconnect(): Promise<void> {
  newConnection();
  googleProblem.value = null;
  forgetHousehold();
  await leave();
}

/*
 * Phones. A phone pairs with a code the wall shows (Settings > Phones):
 * redeemPairing trades it for the phone's own sign-in, a custom token with
 * the household and the phone's device id. The phone watches its devices/
 * document and signs out when the wall removes it (the rules refuse it from
 * that moment).
 */

/** Pair this page as a phone of the household whose wall showed `code`. Throws a message for people. */
export async function pairPhone(code: string, name: string): Promise<void> {
  try {
    const res = await call<{ code: string; name: string }, { customToken: string }>('redeemPairing')({ code, name });
    newConnection();
    googleProblem.value = null;
    await signInWithCustomToken(auth, res.data.customToken);
  } catch (e) {
    throw new Error(errorMessage(e));
  }
}

/** A pairing code for this household (the wall, behind the PIN); valid once, until `expiresAt`. */
export async function makePairingCode(): Promise<{ code: string; expiresAt: number }> {
  try {
    return (await call<void, { code: string; expiresAt: number }>('createPairing')()).data;
  } catch (e) {
    throw new Error(errorMessage(e));
  }
}

/** Put the wall's pairing code away (Done, or the page left): it can no longer pair a phone. */
export async function cancelPairingCode(code: string): Promise<void> {
  try {
    await call<{ code: string }, unknown>('cancelPairing')({ code });
  } catch (e) {
    throw new Error(errorMessage(e));
  }
}

/** Remove a paired phone (the wall): it is signed out and refused from now on. */
export async function removePhone(deviceId: string): Promise<void> {
  try {
    await call<{ deviceId: string }, unknown>('removeDevice')({ deviceId });
  } catch (e) {
    throw new Error(errorMessage(e));
  }
}

const PHONE_REMOVED = 'This phone was removed from the household. Pair it again from the wall.';

/** Unpair this phone (More > This phone): the Function removes it, then it signs out. */
export async function unpairPhone(): Promise<void> {
  const device = pairedDevice();
  const hid = householdId.peek();
  if (!device || !hid) throw new Error('unpairPhone: not a paired phone');
  // Its own removal is no news to report: stop watching for it first.
  stopDeviceWatch?.();
  stopDeviceWatch = null;
  try {
    await removePhone(device);
  } catch (e) {
    watchDevice(hid, device);
    throw e;
  }
  await disconnect();
}

/** A paired phone's Auth user (`deviceUid` in functions/src/pairing.ts). */
const isPhoneUser = (uid: string) => uid.includes('.phone.');

let stopDeviceWatch: (() => void) | null = null;
const LAST_SEEN_EVERY_MS = 60 * 60_000;

/**
 * Follow this phone's devices/ document: when the wall removes it (the
 * server says it is gone, or the rules refuse it), sign out. Also stamps
 * when the phone was last used: when it opens, when it is shown again and
 * on a touch, at most hourly (a phone page stays open for days).
 */
function watchDevice(hid: string, device: string): void {
  stopDeviceWatch?.();
  const ref = doc(db, 'households', hid, 'devices', device);
  /** The stamp as last read or written; null until the document is read. */
  let seen: number | null = null;
  const stamp = () => {
    if (seen === null || document.visibilityState !== 'visible' || Date.now() - seen <= LAST_SEEN_EVERY_MS) return;
    seen = Date.now();
    void updateDoc(ref, { lastSeenAt: seen }).catch(() => {});
  };
  const unsubscribe = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        if (!snap.metadata.fromCache) void removed();
        return;
      }
      seen = Math.max(seen ?? 0, Number(snap.get('lastSeenAt')) || 0);
      stamp();
    },
    (e) => {
      if (e.code === 'permission-denied') void removed();
    },
  );
  document.addEventListener('visibilitychange', stamp);
  const offActivity = onActivity(stamp);
  stopDeviceWatch = () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', stamp);
    offActivity();
  };
}

async function removed(): Promise<void> {
  stopDeviceWatch?.();
  stopDeviceWatch = null;
  await disconnect();
  fail(PHONE_REMOVED);
}

/*
 * The household id rides in the ID token's claims. Reading them refreshes an
 * expired token, which fails offline: a tablet that boots before the Wi-Fi is
 * up would never open its household. So the last household opened is
 * remembered for its user and used when the claims cannot be refreshed for
 * any reason but a refused sign-in (offline, or the token service failing).
 */

interface Household {
  uid: string;
  hid: string;
  account?: string;
  /** A paired phone's device id. */
  device?: string;
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

/** The user's household from fresh claims, or the remembered one while they cannot be refreshed; null without a hid claim. */
async function householdOf(user: User): Promise<Household | null> {
  try {
    const { claims } = await user.getIdTokenResult();
    if (typeof claims.hid !== 'string') return null;
    const h: Household = {
      uid: user.uid,
      hid: claims.hid,
      account: typeof claims.account === 'string' ? claims.account : undefined,
      device: typeof claims.device === 'string' ? claims.device : undefined,
    };
    rememberHousehold(h);
    return h;
  } catch (e) {
    const h = isSignInRefused(e) ? null : recallHousehold(user.uid);
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

/** A pairing code in the URL (`?pair=`, from the wall's QR code). */
export const pairParam = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('pair');

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
  if (!demoMode) void finishRedirect();
  let seq = 0;
  /** The user signed in on this page, if any (a sign-out event names none). */
  let current: User | null = null;
  onAuthStateChanged(auth, (user) => signedInAs(user, ++seq));

  async function signedInAs(user: User | null, n: number): Promise<void> {
    if (!user) {
      // Auth itself dropped a phone's sign-in: its token refresh was refused, as it is once the phone is removed.
      const dropped = !!current && isPhoneUser(current.uid) && !signedOutHere;
      current = null;
      stopDeviceWatch?.();
      stopDeviceWatch = null;
      closeHousehold();
      if (dropped) {
        forgetHousehold();
        fail(PHONE_REMOVED);
        return;
      }
      if (session.value.state === 'connecting' || session.value.state === 'error') return;
      session.value = { state: 'signedOut' };
      // A demo page with `pair` in its address (a code, or empty) pairs like a real phone instead of signing in as the demo wall.
      if (demoMode && pairParam === null) await signInWithCustomToken(auth, demoToken());
      return;
    }
    current = user;
    signedOutHere = false;
    let h: Household | null;
    try {
      h = await householdOf(user);
    } catch (e) {
      if (n !== seq) return;
      if (!isSignInRefused(e)) {
        session.value = { state: 'waiting' };
        whenOnline(() => {
          if (n === seq && auth.currentUser) void signedInAs(auth.currentUser, n);
        });
        return;
      }
      // The sign-in itself was refused (revoked, disabled, a phone removed): connect or pair again.
      fail(isPhoneUser(user.uid) ? PHONE_REMOVED : 'The sign-in expired. Connect the Google account again.');
      await leave();
      return;
    }
    if (n !== seq) return;
    if (!h) {
      await leave();
      return;
    }
    openHousehold(h.hid);
    if (h.device) watchDevice(h.hid, h.device);
    session.value = { state: 'signedIn', account: h.account, device: h.device };
  }
}
