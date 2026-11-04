import { describe, expect, it } from 'vitest';
import { checkRedirect, isAllowedAccount, normalizeEmail } from './policy.js';

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
  it('accepts only /oauth on allowed origins', () => {
    const o = ['https://manwar-home.web.app', 'http://localhost:5173'];
    expect(checkRedirect('https://manwar-home.web.app/oauth', o)).toBe(true);
    expect(checkRedirect('http://localhost:5173/oauth', o)).toBe(true);
    expect(checkRedirect('https://evil.example/oauth', o)).toBe(false);
    expect(checkRedirect('https://manwar-home.web.app/oauth?x=1', o)).toBe(false);
    expect(checkRedirect('https://manwar-home.web.app/other', o)).toBe(false);
    expect(checkRedirect('not a url', o)).toBe(false);
  });
});
