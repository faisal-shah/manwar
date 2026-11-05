import { describe, expect, it } from 'vitest';
import { STALE_SYNC_MS, STALE_WEATHER_MS, calendarStatus, currentWeather, householdStatus } from '../../src/app/status';
import { NETWORK_MESSAGE, errorMessage, isNetworkError, needsReconnect } from '../../src/data/errors';

/** The shapes the Firebase SDKs throw (FirebaseError: code + message). */
const fnError = (code: string, message: string) => Object.assign(new Error(message), { code: `functions/${code}` });
const authError = (code: string) => Object.assign(new Error(`Firebase: Error (auth/${code}).`), { code: `auth/${code}` });

describe('error messages', () => {
  it('drops the HTTP status the Functions SDK appends', () => {
    expect(errorMessage(fnError('permission-denied', 'This Google account is not on the allowlist. [403]'))).toBe(
      'This Google account is not on the allowlist.',
    );
    expect(errorMessage(fnError('failed-precondition', 'Google access was revoked. Connect again. [400]'))).toBe(
      'Google access was revoked. Connect again.',
    );
  });
  it('says the network is down when a callable never reached the server', () => {
    const offline = fnError('internal', 'internal [0]');
    expect(isNetworkError(offline)).toBe(true);
    expect(errorMessage(offline)).toBe(NETWORK_MESSAGE);
    expect(isNetworkError(authError('network-request-failed'))).toBe(true);
    expect(errorMessage(authError('network-request-failed'))).toBe(NETWORK_MESSAGE);
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('explains a bare status code from the server', () => {
    expect(isNetworkError(fnError('internal', 'INTERNAL [500]'))).toBe(false);
    expect(errorMessage(fnError('internal', 'INTERNAL [500]'))).toBe(
      'The server could not finish the request (internal). Try again shortly.',
    );
    expect(errorMessage(fnError('deadline-exceeded', 'deadline-exceeded'))).toContain('(deadline-exceeded)');
  });
  it('rewrites auth errors and passes plain errors through', () => {
    expect(errorMessage(authError('user-token-expired'))).toBe(
      'Sign-in failed (user-token-expired). Connect the Google account again.',
    );
    expect(errorMessage(new Error('Google Calendar 500: Backend Error'))).toBe('Google Calendar 500: Backend Error');
    expect(errorMessage('odd')).toBe('odd');
  });
  it('knows which errors only a reconnect fixes', () => {
    expect(needsReconnect(fnError('failed-precondition', 'Google access was revoked. [400]'))).toBe(true);
    expect(needsReconnect(fnError('permission-denied', 'Not on the allowlist. [403]'))).toBe(true);
    expect(needsReconnect(fnError('unavailable', 'Could not reach Google. [503]'))).toBe(false);
    expect(needsReconnect(fnError('internal', 'internal [0]'))).toBe(false);
    expect(needsReconnect(new Error('x'))).toBe(false);
  });
});

describe('household status in the top bar', () => {
  it('says the wall is not syncing while a listener is down, and why', () => {
    expect(householdStatus(null)).toBeNull();
    expect(householdStatus('Quota exceeded.')).toEqual({
      text: 'Not syncing',
      detail: "The household's data is not coming in (Quota exceeded.). Trying again shortly.",
    });
  });
});

describe('calendar status in the top bar', () => {
  const now = 1_800_000_000_000;
  const HOUR = 3_600_000;
  type Sync = Parameters<typeof calendarStatus>[0];
  const s = (over: Partial<Sync>): Sync => ({ lastSync: null, error: null, failing: [], partial: false, ...over });
  it('is quiet while syncing works, or a failure is still recent', () => {
    expect(calendarStatus(s({ lastSync: now - 60_000 }), null, now)).toBeNull();
    expect(calendarStatus(s({ lastSync: now - STALE_SYNC_MS + 1000, error: 'Failed to fetch' }), null, now)).toBeNull();
  });
  it('shows how old the events are once a failing sync goes stale', () => {
    const failing = [
      { name: 'Family', at: now - HOUR },
      { name: 'School', at: now - 2 * HOUR },
    ];
    expect(calendarStatus(s({ lastSync: now - 2 * HOUR, error: 'Failed to fetch', failing }), null, now)).toEqual({
      text: 'Calendar updated 2 hr ago',
      reconnect: false,
    });
    expect(calendarStatus(s({ error: 'Failed to fetch' }), null, now)).toEqual({
      text: 'Calendar not loaded',
      reconnect: false,
    });
  });
  it('names the one calendar that keeps failing, with its own age', () => {
    // The family calendar synced a minute ago; School has failed for two hours.
    const school = { lastSync: now - 2 * HOUR, error: 'School: Google Calendar 404: Not Found', partial: true };
    expect(calendarStatus(s({ ...school, failing: [{ name: 'School', at: now - 2 * HOUR }] }), null, now)).toEqual({
      text: 'School updated 2 hr ago',
      reconnect: false,
    });
    expect(calendarStatus(s({ ...school, failing: [{ name: 'School', at: now - 60_000 }] }), null, now)).toBeNull();
    expect(calendarStatus(s({ ...school, failing: [{ name: 'School', at: null }] }), null, now)?.text).toBe('School not loaded');
    const two = [
      { name: 'School', at: now - 3 * HOUR },
      { name: 'Soccer', at: now - HOUR },
    ];
    expect(calendarStatus(s({ ...school, failing: two }), null, now)?.text).toBe('2 calendars updated 3 hr ago');
  });
  it('asks for a reconnect whenever Google refused the household', () => {
    expect(calendarStatus(s({ lastSync: now }), 'Google access was revoked.', now)).toEqual({
      text: 'Reconnect Google Calendar',
      reconnect: true,
    });
  });
});

describe('current weather in the top bar', () => {
  it('hides a reading once fetches have failed for hours', () => {
    const now = 1_800_000_000_000;
    const w = { tempC: 20, fetchedAt: now - 60_000 };
    expect(currentWeather(w, now)).toBe(w);
    expect(currentWeather({ ...w, fetchedAt: now - STALE_WEATHER_MS }, now)).toBeNull();
    expect(currentWeather(null, now)).toBeNull();
  });
});
