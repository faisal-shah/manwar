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

/** Web OAuth client used for the household Google Calendar connection. Empty until created in the Cloud Console. */
export const googleClientId = '';

/** The Google account the wall tablet connects to. Pre-selected in the consent popup. */
export const householdEmail = 'household@example.com';

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
