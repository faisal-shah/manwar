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
