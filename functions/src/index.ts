import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableOptions } from 'firebase-functions/v2/https';
import { OAuth2Client } from 'google-auth-library';
import { householdIdFor, isAllowedAccount, missingScopes, parseAccountList } from './policy.js';

initializeApp();
const db = getFirestore();

const CLIENT_ID = defineString('GOOGLE_OAUTH_CLIENT_ID');
/** Full email: firebase-tools does not expand the `name@` short form when granting secret access. */
const RUNTIME_SERVICE_ACCOUNT = defineString('FUNCTIONS_SERVICE_ACCOUNT');
const CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
/**
 * Google accounts allowed to use this deployment (emails, comma separated),
 * so strangers cannot run up the project's bill. Kept in Secret Manager, not
 * the repo; a new version takes effect on the next deploy.
 */
const ALLOWED_ACCOUNTS = defineSecret('ALLOWED_ACCOUNTS');
const allowed = (email: string) => isAllowedAccount(email, parseAccountList(ALLOWED_ACCOUNTS.value()));
const NOT_ALLOWED = 'This Google account is not on the allowlist for this Manwar. Ask its owner to add it.';

const opts: CallableOptions = {
  region: 'us-central1',
  serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  secrets: [CLIENT_SECRET, ALLOWED_ACCOUNTS],
  cors: true,
  maxInstances: 3,
  memory: '256MiB',
};

/** Where the household's Google refresh token lives. Firestore rules deny all client access. */
const tokenDoc = (hid: string) => db.doc(`households/${hid}/private/google`);

/** Codes from the Google Identity Services popup are exchanged with redirect_uri 'postmessage'. */
const oauth = () => new OAuth2Client(CLIENT_ID.value(), CLIENT_SECRET.value(), 'postmessage');

/**
 * Exchange the OAuth code from the tablet's sign-in popup for tokens, keep the
 * refresh token server-side, and sign the tablet in to that Google account's
 * household (created on its first connection). Only allowlisted accounts may
 * connect; the Firestore rules keep households apart.
 */
export const connectGoogle = onCall<{ code?: unknown }>(opts, async (req) => {
  const code = req.data?.code;
  if (typeof code !== 'string' || code.length < 10 || code.length > 2048)
    throw new HttpsError('invalid-argument', 'Missing authorization code.');

  const client = oauth();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    throw new HttpsError('permission-denied', 'Google rejected the sign-in. Try connecting again.');
  }
  if (!tokens.id_token || !tokens.access_token) throw new HttpsError('internal', 'Google returned no identity.');
  let p;
  try {
    p = (await client.verifyIdToken({ idToken: tokens.id_token, audience: CLIENT_ID.value() })).getPayload();
  } catch {
    throw new HttpsError('permission-denied', 'Google rejected the sign-in. Try connecting again.');
  }
  if (!p?.sub || !p.email || p.email_verified !== true)
    throw new HttpsError('permission-denied', 'The Google account has no verified email.');
  if (!allowed(p.email)) throw new HttpsError('permission-denied', NOT_ALLOWED);
  // Checked before anything is stored: a grant without calendar access is no connection.
  if (missingScopes(tokens.scope).length)
    throw new HttpsError(
      'failed-precondition',
      'Manwar needs to see and edit your calendars. Connect again and leave both calendar permissions ticked.',
    );

  const hid = householdIdFor(p.sub);
  const ref = tokenDoc(hid);
  if (tokens.refresh_token) {
    await ref.set({ refreshToken: tokens.refresh_token, account: p.email, scope: tokens.scope ?? '', updatedAt: Date.now() });
  } else if (!(await ref.get()).get('refreshToken')) {
    throw new HttpsError(
      'failed-precondition',
      'Google did not grant offline access. Remove Manwar at myaccount.google.com/permissions and connect again.',
    );
  }
  await db.doc(`households/${hid}`).set({ account: p.email, updatedAt: Date.now() }, { merge: true });

  const customToken = await getAuth().createCustomToken(hid, { hid, account: p.email });
  return {
    customToken,
    accessToken: tokens.access_token,
    expiresAt: tokens.expiry_date ?? Date.now() + 3_000_000,
    account: p.email,
  };
});

/** A fresh Calendar access token for the signed-in household. */
export const googleAccessToken = onCall(opts, async (req) => {
  const hid = req.auth?.token?.hid;
  if (typeof hid !== 'string') throw new HttpsError('unauthenticated', 'Sign in first.');
  const snap = await tokenDoc(hid).get();
  const refreshToken = snap.get('refreshToken');
  if (typeof refreshToken !== 'string')
    throw new HttpsError('failed-precondition', 'Google is not connected. Connect the Google account again.');
  // Removing an account from the allowlist cuts off its calendar access too.
  const account = snap.get('account');
  if (typeof account !== 'string' || !allowed(account)) throw new HttpsError('permission-denied', NOT_ALLOWED);

  const client = oauth();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('no token');
    return { accessToken: token, expiresAt: client.credentials.expiry_date ?? Date.now() + 3_000_000 };
  } catch (e) {
    if (String(e).includes('invalid_grant')) {
      await tokenDoc(hid).update({ refreshToken: null, revokedAt: Date.now() });
      throw new HttpsError('failed-precondition', 'Google access was revoked. Connect the Google account again.');
    }
    throw new HttpsError('unavailable', 'Could not reach Google. Try again shortly.');
  }
});
