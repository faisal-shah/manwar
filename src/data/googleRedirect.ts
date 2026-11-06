/**
 * Google sign-in by redirect (data/session.ts). The page goes to Google's
 * consent page and comes back with a code to Firebase's sign-in handler
 * address, the redirect URI the OAuth client already has registered; the
 * site's service worker answers that navigation with the app itself when
 * its state is the app's (`STATE_PREFIX`, vite.config.ts), and the
 * connectGoogle Function exchanges the code with the same URI and this
 * request's PKCE verifier, so a code read off the address bar or a log
 * signs nobody in. Unit-tested.
 */

/** How long a sign-in that left for Google may take to come back. */
export const REDIRECT_TTL_MS = 15 * 60_000;

/** What the app keeps (localStorage) while it is at Google's page: the request it made. */
export interface PendingRedirect {
  state: string;
  /** The PKCE code verifier, which only this device has. */
  verifier: string;
  at: number;
}

/** Where Google sends the app back: Firebase's registered handler address on the site's one origin. */
export const redirectUri = (host: string) => `https://${host}/__/auth/handler`;

/** The start of every state the app sends: the service worker serves the app for a return carrying it. */
export const STATE_PREFIX = 'manwar-';

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** A new request: a random state and PKCE verifier (43 characters, RFC 7636). */
export function newRequest(at: number): PendingRedirect {
  const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
  return { state: `${STATE_PREFIX}${random()}`, verifier: random(), at };
}

/** The S256 code challenge for a verifier. */
export async function codeChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/**
 * Google's consent page for the household's calendars, offline access (the
 * wall keeps a refresh token). Consent is asked every time, so every
 * connection returns a refresh token and connecting again always repairs a
 * lost one.
 */
export function googleAuthUrl(
  clientId: string,
  scopes: readonly string[],
  host: string,
  state: string,
  challenge: string,
): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(host),
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent select_account',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  return url.href;
}

/** The stored request, read back from storage (outside input: any other shape is none). */
export function parsePending(raw: string | null): PendingRedirect | null {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const { state, verifier, at } = v as Record<string, unknown>;
  return typeof state === 'string' && typeof verifier === 'string' && typeof at === 'number' && Number.isFinite(at)
    ? { state, verifier, at }
    : null;
}

/**
 * What a page load brings back from Google; null when this load is no
 * return. `refused`: it does not answer the request this device made
 * (another state, none pending, or too late), so a link with a code someone
 * else made does not sign the wall in, and the request (another tab's,
 * perhaps) stays. `error`: Google's answer to this request carries no code.
 */
export type RedirectReturn =
  { kind: 'code'; code: string; verifier: string } | { kind: 'error'; error: string } | { kind: 'refused'; error: string } | null;

export function readReturn(search: string, pending: PendingRedirect | null, now: number): RedirectReturn {
  const p = new URLSearchParams(search);
  const state = p.get('state');
  if (!state || !(p.has('code') || p.has('error'))) return null;
  if (!pending || pending.state !== state || now - pending.at > REDIRECT_TTL_MS)
    return { kind: 'refused', error: 'That Google sign-in did not start here, or took too long. Connect again.' };
  const error = p.get('error');
  if (error)
    return {
      kind: 'error',
      error: error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in did not finish (${error}).`,
    };
  return { kind: 'code', code: p.get('code')!, verifier: pending.verifier };
}
