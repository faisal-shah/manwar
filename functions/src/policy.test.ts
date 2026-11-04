import { describe, expect, it } from 'vitest';
import { householdIdFor, isAllowedAccount, normalizeEmail, parseAccountList } from './policy.js';

describe('policy', () => {
  it('derives a household id from the Google subject id', () => {
    expect(householdIdFor('1234567890')).toBe('g1234567890');
  });
  it('normalizes gmail addresses', () => {
    expect(normalizeEmail('Jane.Doe+wall@Gmail.com')).toBe('janedoe@gmail.com');
    expect(normalizeEmail('a.b@example.com')).toBe('a.b@example.com');
  });
  it('parses the allowlist secret', () => {
    expect(parseAccountList(' a@example.com, b@gmail.com\nc@example.org  ')).toEqual([
      'a@example.com',
      'b@gmail.com',
      'c@example.org',
    ]);
    expect(parseAccountList('')).toEqual([]);
  });
  it('allows only listed accounts', () => {
    const list = parseAccountList('jane.doe@gmail.com, team@example.com');
    expect(isAllowedAccount('JaneDoe@gmail.com', list)).toBe(true);
    expect(isAllowedAccount('team@example.com', list)).toBe(true);
    expect(isAllowedAccount('someone@gmail.com', list)).toBe(false);
    expect(isAllowedAccount('x@gmail.com', [])).toBe(false);
  });
});
