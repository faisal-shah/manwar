/** Pure helpers used by the Functions, unit-tested in policy.test.ts. */

/**
 * A connected Google account's household, keyed by the account's stable
 * Google subject id (not its email, which can change).
 */
export const householdIdFor = (googleSub: string) => `g${googleSub}`;

/** Gmail addresses compare case-insensitively and ignore dots and +tags in the local part. */
export function normalizeEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!domain) return email.trim().toLowerCase();
  return domain === 'gmail.com' || domain === 'googlemail.com'
    ? `${local.split('+')[0].replace(/\./g, '')}@gmail.com`
    : `${local}@${domain}`;
}

/** The ALLOWED_ACCOUNTS secret: emails separated by commas, spaces or newlines. */
export const parseAccountList = (raw: string) => raw.split(/[\s,]+/).filter((a) => a.includes('@'));

export function isAllowedAccount(email: string, allowed: string[]): boolean {
  const e = normalizeEmail(email);
  return allowed.some((a) => normalizeEmail(a) === e);
}

/** Calendar access the wall needs: read and write events, list the account's calendars. */
export const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

/**
 * Required scopes missing from a token response's space-separated `scope`.
 * Google's consent screen lets people untick each permission, and the
 * connection then succeeds without calendar access.
 */
export function missingScopes(granted: string | undefined): string[] {
  const have = new Set((granted ?? '').split(/\s+/).filter(Boolean));
  return REQUIRED_SCOPES.filter((s) => !have.has(s));
}
