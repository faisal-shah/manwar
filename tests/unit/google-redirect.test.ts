import { describe, expect, it } from 'vitest';
import { googleAuthUrl, readReturn, redirectUri, REDIRECT_TTL_MS } from '../../src/data/googleRedirect';

describe('Google sign-in by redirect (the installed app)', () => {
  it("asks Google for the calendars, offline, coming back to Firebase's registered handler address", () => {
    const url = new URL(googleAuthUrl('client-1', ['openid', 'email'], 'home.example.com', 'st-1'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'client-1',
      redirect_uri: 'https://home.example.com/__/auth/handler',
      response_type: 'code',
      scope: 'openid email',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state: 'st-1',
    });
    expect(redirectUri('home.example.com')).toBe('https://home.example.com/__/auth/handler');
  });

  it('reads the code Google brings back for the request this device made', () => {
    const pending = { state: 'st-1', at: 1000 };
    expect(readReturn('?state=st-1&code=4%2Fabc&scope=x', pending, 2000)).toEqual({ code: '4/abc' });
    expect(readReturn('?state=st-1&error=access_denied', pending, 2000)).toEqual({ error: 'Google sign-in was cancelled.' });
    expect(readReturn('?state=st-1&error=server_error', pending, 2000)).toEqual({
      error: 'Google sign-in did not finish (server_error).',
    });
  });

  it('is no return without a state and a code or error (an ordinary load, a pairing link)', () => {
    expect(readReturn('', null, 0)).toBeNull();
    expect(readReturn('?pair=ABCD1234', null, 0)).toBeNull();
    expect(readReturn('?code=x', { state: 's', at: 0 }, 0)).toBeNull();
  });

  it('refuses a code it did not ask for, or one that came back too late', () => {
    const refused = { error: 'That Google sign-in did not start on this tablet, or took too long. Connect again.' };
    expect(readReturn('?state=other&code=x', { state: 'st-1', at: 0 }, 1)).toEqual(refused);
    expect(readReturn('?state=st-1&code=x', null, 1)).toEqual(refused);
    expect(readReturn('?state=st-1&code=x', { state: 'st-1', at: 0 }, REDIRECT_TTL_MS + 1)).toEqual(refused);
  });
});
