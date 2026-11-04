import { signal } from '@preact/signals';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { demoMode, googleClientId, googleScopes, householdEmail } from '../config';
import { auth, functions } from './firebase';
import { closeHousehold, openHousehold } from './store';

/**
 * Who the tablet is signed in as. A household signs in once through Google
 * (OAuth code flow, full-page redirect so it works in kiosk browsers); the
 * connectGoogle Function keeps the refresh token server-side and returns a
 * Firebase custom token carrying the household id (`hid` claim).
 */
export type SessionState = 'loading' | 'signedOut' | 'connecting' | 'signedIn' | 'error';

export const session = signal<{ state: SessionState; account?: string; error?: string }>({ state: 'loading' });

const REDIRECT_PATH = '/oauth';
const STATE_KEY = 'manwar.oauthState';
export const redirectUri = () => `${location.origin}${REDIRECT_PATH}`;

interface ConnectResult {
  customToken: string;
  accessToken: string;
  expiresAt: number;
  account: string;
}

/** Leave for Google's consent screen; returns to /oauth. */
export function startGoogleConnect(): void {
  if (!googleClientId) {
    session.value = { state: 'error', error: 'The Google OAuth client id is not configured yet (src/config.ts).' };
    return;
  }
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: googleScopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    login_hint: householdEmail,
    state,
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

async function finishRedirect(): Promise<void> {
  const q = new URLSearchParams(location.search);
  history.replaceState(null, '', '/');
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (q.get('error')) throw new Error(`Google sign-in was cancelled (${q.get('error')}).`);
  const code = q.get('code');
  if (!code || !expected || q.get('state') !== expected)
    throw new Error('The Google sign-in response did not match this tablet. Try again.');
  const res = await httpsCallable<{ code: string; redirectUri: string }, ConnectResult>(
    functions,
    'connectGoogle',
  )({ code, redirectUri: redirectUri() });
  cacheToken(res.data.accessToken, res.data.expiresAt);
  await signInWithCustomToken(auth, res.data.customToken);
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
    uid: 'demo-household',
    claims: { hid: 'demo', account: 'demo@manwar.local' },
  };
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`;
}

export function initSession(): void {
  const returning = location.pathname === REDIRECT_PATH;
  if (returning) session.value = { state: 'connecting' };

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      closeHousehold();
      if (session.value.state === 'connecting' || session.value.state === 'error') return;
      session.value = { state: 'signedOut' };
      if (demoMode) await signInWithCustomToken(auth, demoToken());
      return;
    }
    const claims = (await user.getIdTokenResult()).claims;
    const hid = typeof claims.hid === 'string' ? claims.hid : null;
    if (!hid) {
      await signOut(auth);
      return;
    }
    openHousehold(hid);
    session.value = { state: 'signedIn', account: typeof claims.account === 'string' ? claims.account : undefined };
  });

  if (returning)
    finishRedirect().catch((e: unknown) => {
      session.value = { state: 'error', error: e instanceof Error ? e.message : String(e) };
    });
}
