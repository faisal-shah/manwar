/**
 * Messages for people from Firebase errors. The Functions SDK appends the
 * HTTP status (" [403]") to every message and reports a failed request as
 * "internal [0]"; Auth reports "Firebase: Error (auth/...)". None of that
 * belongs on the wall.
 */

export const NETWORK_MESSAGE = 'Could not reach the server. Check the Wi-Fi and try again.';

interface CodedError {
  code: string;
  message: string;
}

const coded = (e: unknown): e is CodedError =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as CodedError).code === 'string' &&
  typeof (e as CodedError).message === 'string';

const STATUS_SUFFIX = /\s*\[\d+\]$/;

/** The request never reached the server (offline, DNS, a dropped connection). Firestore says 'unavailable'. */
export function isNetworkError(e: unknown): boolean {
  if (!coded(e)) return e instanceof TypeError;
  if (e.code === 'auth/network-request-failed' || e.code === 'unavailable') return true;
  return e.code.startsWith('functions/') && / \[0\]$/.test(e.message);
}

/**
 * Auth refused the stored sign-in itself (revoked, disabled, deleted): only
 * connecting again helps. Anything else from a token refresh (a busy or
 * failing server, rate limits) passes, so it must not sign the wall out.
 */
const REFUSED = new Set([
  'auth/user-token-expired',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/invalid-user-token',
  'auth/invalid-refresh-token',
]);
export const isSignInRefused = (e: unknown): boolean => coded(e) && REFUSED.has(e.code);

/** A Functions error only connecting Google again fixes (access revoked, account off the allowlist). */
export function needsReconnect(e: unknown): boolean {
  return coded(e) && (e.code === 'functions/failed-precondition' || e.code === 'functions/permission-denied');
}

export function errorMessage(e: unknown): string {
  if (isNetworkError(e)) return NETWORK_MESSAGE;
  if (!coded(e)) return e instanceof Error ? e.message : String(e);
  if (e.code.startsWith('functions/')) {
    const code = e.code.slice('functions/'.length);
    const text = e.message.replace(STATUS_SUFFIX, '').trim();
    // Without a message from our Function, the SDK repeats the code ("unavailable", "INTERNAL").
    if (!text || text.toLowerCase() === code || text.toLowerCase() === code.replace(/-/g, '_'))
      return `The server could not finish the request (${code}). Try again shortly.`;
    return text;
  }
  if (e.code.startsWith('auth/')) return `Sign-in failed (${e.code.slice('auth/'.length)}). Connect the Google account again.`;
  return e.message;
}
