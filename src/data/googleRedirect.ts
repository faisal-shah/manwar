/**
 * Google sign-in by redirect, for the installed app (Android's "Install
 * app"): Google's popup opens outside an installed app and cannot hand its
 * code back, so the app goes to Google's page itself and comes back with
 * the code (data/session.ts). It comes back to Firebase's sign-in handler
 * address, the redirect URI the OAuth client already has registered; the
 * site's service worker answers that navigation with the app itself when
 * its state is the app's (`STATE_PREFIX`, vite.config.ts), and the
 * connectGoogle Function exchanges the code with the same URI. Pure,
 * unit-tested.
 */

/** How long a sign-in that left for Google may take to come back. */
export const REDIRECT_TTL_MS = 15 * 60_000;

/** What the app keeps (localStorage) while it is at Google's page: the request it made. */
export interface PendingRedirect {
  state: string;
  at: number;
}

/** Where Google sends the app back: Firebase's registered handler address on the site's one origin. */
export const redirectUri = (host: string) => `https://${host}/__/auth/handler`;

/** The start of every state the app sends: the service worker serves the app for a return carrying it. */
export const STATE_PREFIX = 'manwar-';

/** Google's consent page for the household's calendars, offline access (the wall keeps a refresh token). */
export function googleAuthUrl(clientId: string, scopes: readonly string[], host: string, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(host),
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  }).toString();
  return url.href;
}

/** The query parameters Google's return adds to the address, removed once read. */
export const RETURN_PARAMS = ['code', 'state', 'scope', 'error', 'authuser', 'prompt', 'hd'] as const;

export type RedirectReturn = { code: string } | { error: string } | null;

/**
 * What a page load brings back from Google: the code, or why there is none;
 * null when this load is no return. A return that does not answer the
 * request this device made (another state, none pending, or too late) is
 * refused: a link with a code someone else made must not sign the wall in.
 */
export function readReturn(search: string, pending: PendingRedirect | null, now: number): RedirectReturn {
  const p = new URLSearchParams(search);
  const state = p.get('state');
  if (!state || !(p.has('code') || p.has('error'))) return null;
  if (!pending || pending.state !== state || now - pending.at > REDIRECT_TTL_MS)
    return { error: 'That Google sign-in did not start on this tablet, or took too long. Connect again.' };
  const error = p.get('error');
  if (error)
    return { error: error === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in did not finish (${error}).` };
  return { code: p.get('code')! };
}
