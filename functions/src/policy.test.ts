import { describe, expect, it } from 'vitest';
import { isAllowedAccount, normalizeEmail } from './policy.js';

describe('policy', () => {
  it('normalizes gmail addresses', () => {
    expect(normalizeEmail('House.Hold+wall@Example.com')).toBe('household@example.com');
    expect(normalizeEmail('a.b@example.com')).toBe('a.b@example.com');
  });
  it('allows only the household account', () => {
    expect(isAllowedAccount('household@example.com', ['household@example.com'])).toBe(true);
    expect(isAllowedAccount('someone@gmail.com', ['household@example.com'])).toBe(false);
    expect(isAllowedAccount('x@gmail.com', [''])).toBe(false);
  });
});
