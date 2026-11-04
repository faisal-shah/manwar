import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineList, defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableOptions } from 'firebase-functions/v2/https';
import { OAuth2Client } from 'google-auth-library';
import { checkRedirect, householdIdFor, isAllowedAccount } from './policy.js';

initializeApp();
const db = getFirestore();

const CLIENT_ID = defineString('GOOGLE_OAUTH_CLIENT_ID');
const CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
const HOUSEHOLD_EMAILS = defineList('HOUSEHOLD_EMAILS');
const ALLOWED_ORIGINS = defineList('ALLOWED_ORIGINS');

const opts: CallableOptions = {
  region: 'us-central1',
  serviceAccount: 'manwar-functions@manwar-home.iam.gserviceaccount.com',
  secrets: [CLIENT_SECRET],
  cors: true,
  maxInstances: 3,
  memory: '256MiB',
};

/** Where the household's Google refresh token lives. Firestore rules deny all client access. */
const tokenDoc = (hid: string) => db.doc(`households/${hid}/private/google`);

const oauth = (redirectUri?: string) => new OAuth2Client(CLIENT_ID.value(), CLIENT_SECRET.value(), redirectUri);

/**
 * Exchange the OAuth code from the tablet's redirect for tokens, keep the
 * refresh token server-side, and sign the tablet in as the household.
 */
export const connectGoogle = onCall<{ code?: unknown; redirectUri?: unknown }>(opts, async (req) => {
  const { code, redirectUri } = req.data ?? {};
  if (typeof code !== 'string' || code.length < 10 || code.length > 2048) throw new HttpsError('invalid-argument', 'Missing authorization code.');
  if (typeof redirectUri !== 'string' || !checkRedirect(redirectUri, ALLOWED_ORIGINS.value()))
    throw new HttpsError('invalid-argument', 'Redirect URI not allowed.');

  const client = oauth(redirectUri);
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    throw new HttpsError('permission-denied', 'Google rejected the sign-in. Try connecting again.');
  }
  if (!tokens.id_token || !tokens.access_token) throw new HttpsError('internal', 'Google returned no identity.');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: CLIENT_ID.value() });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email || p.email_verified !== true) throw new HttpsError('permission-denied', 'The Google account has no verified email.');
  if (!isAllowedAccount(p.email, HOUSEHOLD_EMAILS.value()))
    throw new HttpsError('permission-denied', `${p.email} is not this household's Google account.`);

  const hid = householdIdFor(p.sub);
  const ref = tokenDoc(hid);
  if (tokens.refresh_token) {
    await ref.set({ refreshToken: tokens.refresh_token, account: p.email, scope: tokens.scope ?? '', updatedAt: Date.now() });
  } else if (!(await ref.get()).get('refreshToken')) {
    throw new HttpsError('failed-precondition', 'Google did not grant offline access. Remove Manwar at myaccount.google.com/permissions and connect again.');
  }
  await db.doc(`households/${hid}`).set({ account: p.email, updatedAt: Date.now() }, { merge: true });

  const customToken = await getAuth().createCustomToken(hid, { hid, account: p.email });
  return { customToken, accessToken: tokens.access_token, expiresAt: tokens.expiry_date ?? Date.now() + 3_000_000, account: p.email };
});

/** A fresh Calendar access token for the signed-in household. */
export const googleAccessToken = onCall(opts, async (req) => {
  const hid = req.auth?.token?.hid;
  if (typeof hid !== 'string') throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await tokenDoc(hid).get();
  const refreshToken = snap.get('refreshToken');
  if (typeof refreshToken !== 'string') throw new HttpsError('failed-precondition', 'Google is not connected. Connect the household account again.');

  const client = oauth();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('no token');
    return { accessToken: token, expiresAt: client.credentials.expiry_date ?? Date.now() + 3_000_000 };
  } catch (e) {
    if (String(e).includes('invalid_grant')) {
      await tokenDoc(hid).update({ refreshToken: null, revokedAt: Date.now() });
      throw new HttpsError('failed-precondition', 'Google access was revoked. Connect the household account again.');
    }
    throw new HttpsError('unavailable', 'Could not reach Google. Try again shortly.');
  }
});
