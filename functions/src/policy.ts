/** Pure checks used by the Functions, unit-tested in policy.test.ts. */

export const householdIdFor = (googleSub: string) => `g${googleSub}`;

/** Gmail addresses compare case-insensitively and ignore dots in the local part. */
export function normalizeEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split('@');
  if (!domain) return email.trim().toLowerCase();
  return domain === 'gmail.com' || domain === 'googlemail.com'
    ? `${local.split('+')[0].replace(/\./g, '')}@gmail.com`
    : `${local}@${domain}`;
}

export function isAllowedAccount(email: string, allowed: string[]): boolean {
  const e = normalizeEmail(email);
  return allowed.some((a) => a.trim() && normalizeEmail(a) === e);
}
