import { signal } from '@preact/signals';
import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { demoMode, googleClientId, googleScopes } from '../config';
import { auth, functions } from './firebase';
import { closeHousehold, openHousehold } from './store';

/**
 * Who the tablet is signed in as. A household signs in once with Google's
 * popup code flow (Google Identity Services, redirect_uri 'postmessage', so
 * only the page origin has to be registered on the OAuth client); the
 * connectGoogle Function exchanges the code, keeps the refresh token
 * server-side and returns a Firebase custom token carrying the household id
 * (`hid` claim).
 */
export type SessionState = 'loading' | 'signedOut' | 'connecting' | 'signedIn' | 'error';

export const session = signal<{ state: SessionState; account?: string; error?: string }>({ state: 'loading' });

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

/** Open Google's account chooser and consent popup. Must run in a tap handler. */
export function startGoogleConnect(): void {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    fail('Google sign-in is still loading. Try again in a moment.');
    void loadGis().catch((e: Error) => fail(e.message));
    return;
  }
  oauth2
    .initCodeClient({
      client_id: googleClientId,
      scope: googleScopes.join(' '),
      ux_mode: 'popup',
      callback: (r) => {
        if (r.code) void exchange(r.code);
        else fail(`Google sign-in did not finish (${r.error_description ?? r.error ?? 'no code'}).`);
      },
      error_callback: (e) =>
        fail(
          e.type === 'popup_closed'
            ? 'The Google window was closed before finishing.'
            : 'The browser blocked the Google sign-in window.',
        ),
    })
    .requestCode();
}

async function exchange(code: string): Promise<void> {
  session.value = { state: 'connecting' };
  try {
    const res = await httpsCallable<{ code: string }, ConnectResult>(functions, 'connectGoogle')({ code });
    cacheToken(res.data.accessToken, res.data.expiresAt);
    await signInWithCustomToken(auth, res.data.customToken);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

let token: { value: string; expiresAt: number } | null = null;
const cacheToken = (value: string, expiresAt: number) => (token = { value, expiresAt });

/** A Google Calendar access token for the household, minted by the googleAccessToken Function. */
export async function googleAccessToken(): Promise<string> {
  if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
  const res = await httpsCallable<void, { accessToken: string; expiresAt: number }>(functions, 'googleAccessToken')();
  cacheToken(res.data.accessToken, res.data.expiresAt);
  return res.data.accessToken;
}

export async function disconnect(): Promise<void> {
  token = null;
  await signOut(auth);
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

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      closeHousehold();
      if (session.value.state === 'connecting' || session.value.state === 'error') return;
      session.value = { state: 'signedOut' };
      if (demoMode) await signInWithCustomToken(auth, demoToken());
      return;
    }
    const claims = await claimsOf(user);
    if (!claims.hid) {
      await signOut(auth);
      return;
    }
    openHousehold(claims.hid);
    session.value = { state: 'signedIn', account: claims.account };
  });
}

const CLAIMS_KEY = 'manwar.claims.v1';

/**
 * The household claims of the signed-in user. Reading them refreshes an
 * expired ID token over the network, which fails when the wall starts while
 * the Wi-Fi is down (a power cut restarts the tablet before the router). The
 * claims of the last sign-in are kept for that case, so the wall still opens
 * on its cached data and calendar.
 */
async function claimsOf(user: User): Promise<{ hid: string | null; account?: string }> {
  try {
    const c = (await user.getIdTokenResult()).claims;
    const claims = {
      hid: typeof c.hid === 'string' ? c.hid : null,
      account: typeof c.account === 'string' ? c.account : undefined,
    };
    try {
      localStorage.setItem(CLAIMS_KEY, JSON.stringify({ uid: user.uid, ...claims }));
    } catch {
      /* storage unavailable: no offline start, everything else works */
    }
    return claims;
  } catch (e) {
    let saved: { uid?: string; hid?: unknown; account?: unknown } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(CLAIMS_KEY) ?? 'null');
    } catch {
      /* unreadable: treat as none */
    }
    if (saved?.uid !== user.uid || typeof saved.hid !== 'string') throw e;
    return { hid: saved.hid, account: typeof saved.account === 'string' ? saved.account : undefined };
  }
}
