import { signal } from '@preact/signals';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { HOUSEHOLD_KEY } from './householdKey';
import { httpsCallable } from 'firebase/functions';
import { canonicalHost, demoMode, googleClientId, googleScopes } from '../config';
import { onActivity } from '../core/activity';
import { errorMessage, isSignInRefused, NETWORK_MESSAGE, needsReconnect } from './errors';
import { auth, db, functions } from './firebase';
import { closeHousehold, householdId, openHousehold } from './store';
import { codeChallenge, googleAuthUrl, newRequest, parsePending, readReturn, redirectUri } from './googleRedirect';

/**
 * Who the tablet is signed in as. A household signs in once with Google
 * (by redirect, startGoogleConnect); the connectGoogle Function exchanges
 * the code, keeps the refresh token server-side and returns a Firebase
 * custom token carrying the household id (`hid` claim).
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

const fail = (error: string) => (session.value = { state: 'error', error });

/**
 * A connection to Google is under way on this page: it waits to leave for
 * Google's page, or finishes a return from it. The update reload waits
 * (app/start.ts), as it would lose the sign-in.
 */
export const googleBusy = signal(false);

/** What a reconnect while signed in came to (connected, or why not), for the wall to say in a toast once. */
export const reconnectNote = signal<string | null>(null);

const REDIRECT_KEY = 'manwar.googleRedirect.v1';
/** How long a first visit's service worker may take to install before the redirect gives up waiting. */
const SW_READY_MS = 20_000;

/**
 * Connect the household's Google account: the page goes to Google's
 * account chooser and consent and comes back with the code
 * (data/googleRedirect.ts), which the connectGoogle Function exchanges.
 * Errors before leaving go to `report` (the sign-in screen by default); a
 * reconnect's result shows on the page it comes back to (`reconnectNote`).
 */
export function startGoogleConnect(report: (message: string) => void = fail): void {
  void redirectToGoogle(report);
}

async function redirectToGoogle(report: (message: string) => void): Promise<void> {
  // The return is answered by the service worker: without one, Firebase's handler page would answer it.
  if (!('serviceWorker' in navigator)) return report('This browser cannot finish a Google sign-in. Open Manwar in Chrome.');
  if (!navigator.onLine) return report(NETWORK_MESSAGE);
  const signingIn = session.value.state !== 'signedIn';
  googleBusy.value = true;
  if (signingIn) session.value = { state: 'connecting' };
  const stop = (message: string) => {
    googleBusy.value = false;
    report(message);
  };
  // A first visit's service worker is still installing for a few seconds.
  const active = await Promise.race([
    navigator.serviceWorker.ready.then((r) => !!r.active),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), SW_READY_MS)),
  ]);
  if (!active) return stop('The app is still installing itself. Try again in a moment.');
  const request = newRequest(Date.now());
  try {
    localStorage.setItem(REDIRECT_KEY, JSON.stringify(request));
  } catch {
    return stop('This browser keeps no storage, so Google sign-in cannot come back to it.');
  }
  location.assign(
    googleAuthUrl(googleClientId, googleScopes, canonicalHost, request.state, await codeChallenge(request.verifier)),
  );
}

/** Finish a sign-in that came back from Google (redirectToGoogle), once this page knows who is signed in. */
async function finishRedirect(): Promise<void> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(REDIRECT_KEY);
  } catch {
    /* nothing pending */
  }
  const back = readReturn(location.search, parsePending(stored), Date.now());
  if (!back) return;
  if (back.kind !== 'refused') {
    try {
      localStorage.removeItem(REDIRECT_KEY);
    } catch {
      /* gone with the storage */
    }
  }
  // The code is used once: the address no longer carries it, and is the app's own again (not the handler's).
  history.replaceState(history.state, '', '/');
  googleBusy.value = true;
  try {
    await auth.authStateReady();
    // Signed in already: a reconnect, which keeps the wall on screen and says how it went in a toast.
    const reconnecting = !!auth.currentUser;
    const report = reconnecting ? (text: string) => (reconnectNote.value = text) : fail;
    if (back.kind === 'code') await exchange(back.code, back.verifier, reconnecting, report);
    else report(back.error);
  } finally {
    googleBusy.value = false;
  }
}

const call = <Req, Res>(name: string) => httpsCallable<Req, Res>(functions, name);

/** The code exchange on its way: token requests wait for it, as it brings the new connection's token. */
let exchanging: Promise<void> | null = null;

/**
 * Trade the code for a Firebase sign-in. A reconnect keeps the wall on
 * screen: the same account keeps its household (the auth user does not
 * change, so no auth event fires), another account switches to its own
 * household through the auth listener.
 */
function exchange(code: string, verifier: string, reconnecting: boolean, report: (message: string) => void): Promise<void> {
  if (!reconnecting) session.value = { state: 'connecting' };
  const run = (async () => {
    try {
      const res = await call<{ code: string; codeVerifier: string; redirectUri: string }, ConnectResult>('connectGoogle')({
        code,
        codeVerifier: verifier,
        redirectUri: redirectUri(canonicalHost),
      });
      newConnection();
      cacheToken(res.data.accessToken, res.data.expiresAt);
      googleProblem.value = null;
      await signInWithCustomToken(auth, res.data.customToken);
      if (reconnecting) {
        if (session.value.state === 'signedIn') session.value = { ...session.value, account: res.data.account };
        reconnectNote.value = 'Google Calendar is connected again.';
      }
    } catch (e) {
      report(errorMessage(e));
    }
  })().finally(() => {
    if (exchanging === run) exchanging = null;
  });
  exchanging = run;
  return run;
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
  if (exchanging) return exchanging.then(googleAccessToken);
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
  if (!demoMode) void finishRedirect();
  // Back from Google's page without finishing (the page restored from the back/forward cache): connect again.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted || !googleBusy.peek()) return;
    googleBusy.value = false;
    if (session.value.state === 'connecting') session.value = { state: 'signedOut' };
  });
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
