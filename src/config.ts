/**
 * Public client configuration. None of these values are secrets: Firebase web
 * config and OAuth client ids are designed to ship in the page. The OAuth
 * client id must match GOOGLE_OAUTH_CLIENT_ID in functions/.env
 * (tests/unit/config.test.ts checks this).
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyD0XQ_uBM9dgiawofpGTV_stuvL7AuY-xE',
  authDomain: 'manwar-home.firebaseapp.com',
  projectId: 'manwar-home',
  storageBucket: 'manwar-home.firebasestorage.app',
  messagingSenderId: '1056874888372',
  appId: '1:1056874888372:web:d069969a315965a9496be1',
};

/**
 * Web OAuth client for the Google Calendar connection: the client Firebase
 * created for Google sign-in. Its registered JavaScript origins are the
 * project's firebaseapp.com host and localhost, so the app is served from
 * `canonicalHost` and the project's web.app host forwards there.
 */
export const googleClientId = '1056874888372-5akc9aoc2ouj70gck1heqosn74ugfqpq.apps.googleusercontent.com';

export const canonicalHost = firebaseConfig.authDomain;
/** Other hosts Firebase serves the same site on; they forward to `canonicalHost`. */
export const forwardedHosts = [`${firebaseConfig.projectId}.web.app`];

export const functionsRegion = 'us-central1';

/** Calendar scopes: read/write events on every calendar, list the account's calendars. */
export const googleScopes = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

/**
 * Demo mode runs against the Firebase emulators with a fake calendar, so the
 * app can be developed, tested and screenshotted without the household
 * account. On with `?demo` in the URL or VITE_DEMO=1 at build time.
 */
export const demoMode =
  import.meta.env.VITE_DEMO === '1' || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo'));

/** Build identifier (the git commit in CI), shown in Settings > About and on <html data-build>. */
export const buildId: string = import.meta.env.VITE_BUILD_ID?.slice(0, 7) || 'dev';
