import { describe, expect, it } from 'vitest';
import {
  codeChallenge,
  googleAuthUrl,
  newRequest,
  parsePending,
  readReturn,
  redirectUri,
  REDIRECT_TTL_MS,
  STATE_PREFIX,
} from '../../src/data/googleRedirect';

describe('Google sign-in by redirect', () => {
  it("asks Google for the calendars, offline, with consent and PKCE, coming back to Firebase's registered handler", () => {
    const url = new URL(googleAuthUrl('client-1', ['openid', 'email'], 'home.example.com', 'st-1', 'chal-1'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-1',
      redirect_uri: 'https://home.example.com/__/auth/handler',
      response_type: 'code',
      scope: 'openid email',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent select_account',
      code_challenge: 'chal-1',
      code_challenge_method: 'S256',
      state: 'st-1',
    });
    expect(redirectUri('home.example.com')).toBe('https://home.example.com/__/auth/handler');
  });

  it('makes a fresh state and a 43-character verifier per request', () => {
    const a = newRequest(5);
    const b = newRequest(5);
    expect(a.state.startsWith(STATE_PREFIX)).toBe(true);
    expect(a.state).not.toBe(b.state);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.at).toBe(5);
  });

  it('derives the S256 challenge (RFC 7636 appendix B)', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('reads back only a well-formed stored request', () => {
    const r = { state: 's', verifier: 'v', at: 1 };
    expect(parsePending(JSON.stringify(r))).toEqual(r);
    expect(parsePending(null)).toBeNull();
    expect(parsePending('not json')).toBeNull();
    expect(parsePending(JSON.stringify({ state: 's', at: 1 }))).toBeNull();
    expect(parsePending(JSON.stringify({ state: 's', verifier: 'v', at: 'soon' }))).toBeNull();
    expect(parsePending('null')).toBeNull();
  });

  it('reads the code Google brings back for the request this device made, with its verifier', () => {
    const pending = { state: 'st-1', verifier: 'ver-1', at: 1000 };
    expect(readReturn('?state=st-1&code=4%2Fabc&scope=x', pending, 2000)).toEqual({
      kind: 'code',
      code: '4/abc',
      verifier: 'ver-1',
    });
    expect(readReturn('?state=st-1&error=access_denied', pending, 2000)).toEqual({
      kind: 'error',
      error: 'Google sign-in was cancelled.',
    });
    expect(readReturn('?state=st-1&error=server_error', pending, 2000)).toEqual({
      kind: 'error',
      error: 'Google sign-in did not finish (server_error).',
    });
  });

  it('is no return without a state and a code or error (an ordinary load, a pairing link)', () => {
    expect(readReturn('', null, 0)).toBeNull();
    expect(readReturn('?pair=ABCD1234', null, 0)).toBeNull();
    expect(readReturn('?code=x', { state: 's', verifier: 'v', at: 0 }, 0)).toBeNull();
  });

  it('refuses a code it did not ask for, or one that came back too late', () => {
    const refused = { kind: 'refused', error: 'That Google sign-in did not start here, or took too long. Connect again.' };
    expect(readReturn('?state=other&code=x', { state: 'st-1', verifier: 'v', at: 0 }, 1)).toEqual(refused);
    expect(readReturn('?state=st-1&code=x', null, 1)).toEqual(refused);
    expect(readReturn('?state=st-1&code=x', { state: 'st-1', verifier: 'v', at: 0 }, REDIRECT_TTL_MS + 1)).toEqual(refused);
  });
});
