import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableOptions } from 'firebase-functions/v2/https';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes } from 'node:crypto';
import { PAIRING_TTL_MS, codeFromBytes, deviceName, deviceUid, isDeviceId, normalizeCode, rateLimiter } from './pairing.js';
import { exchangeRedirect, householdIdFor, isAllowedAccount, missingScopes, parseAccountList } from './policy.js';

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
/**
 * The emulator has no Secret Manager: there the demo households (accounts
 * at manwar.local, which no real Google account has) are the allowed ones.
 * Only an emulator running a demo project counts.
 */
const emulator = process.env.FUNCTIONS_EMULATOR === 'true' && (process.env.GCLOUD_PROJECT ?? '').startsWith('demo-');
const allowed = (email: unknown): email is string =>
  typeof email === 'string' &&
  (emulator ? email.endsWith('@manwar.local') : isAllowedAccount(email, parseAccountList(ALLOWED_ACCOUNTS.value())));
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

/**
 * The OAuth client a code is exchanged with: redirect_uri 'postmessage' for
 * Google Identity Services' popup, the site's root for the installed app's
 * redirect (exchangeRedirect), as the code was requested.
 */
const oauth = (redirect = 'postmessage') => new OAuth2Client(CLIENT_ID.value(), CLIENT_SECRET.value(), redirect);

/**
 * Exchange the OAuth code from the tablet's sign-in popup for tokens, keep the
 * refresh token server-side, and sign the tablet in to that Google account's
 * household (created on its first connection). Only allowlisted accounts may
 * connect; the Firestore rules keep households apart.
 */
export const connectGoogle = onCall<{ code?: unknown; redirectUri?: unknown }>(opts, async (req) => {
  const code = req.data?.code;
  if (typeof code !== 'string' || code.length < 10 || code.length > 2048)
    throw new HttpsError('invalid-argument', 'Missing authorization code.');
  const redirect = exchangeRedirect(req.data?.redirectUri, process.env.GCLOUD_PROJECT ?? '');
  if (!redirect) throw new HttpsError('invalid-argument', 'That sign-in did not come back to this site.');

  const client = oauth(redirect);
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

const REMOVED = 'This phone was removed from the household. Pair it again from the wall.';
const deviceDoc = (hid: string, id: string) => db.doc(`households/${hid}/devices/${id}`);

/**
 * The caller's household, and its device id when the caller is a paired
 * phone (null for a wall, which signs in with the Google account itself).
 * A phone removed from its household is refused here as the Firestore
 * rules refuse it.
 */
async function caller(req: { auth?: { token: Record<string, unknown> } }): Promise<{ hid: string; device: string | null }> {
  const t = req.auth?.token;
  const hid = t?.hid;
  if (typeof hid !== 'string') throw new HttpsError('unauthenticated', 'Sign in first.');
  if (t?.device === undefined) return { hid, device: null };
  if (!isDeviceId(t.device) || !(await deviceDoc(hid, t.device).get()).exists) throw new HttpsError('permission-denied', REMOVED);
  return { hid, device: t.device };
}

/** A fresh Calendar access token for the signed-in household. */
export const googleAccessToken = onCall(opts, async (req) => {
  const { hid } = await caller(req);
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

/*
 * Phones. The wall makes a pairing code (Settings > Phones, behind the
 * parent PIN); a phone that presents it within ten minutes, once, becomes a
 * device of the household with its own sign-in (`device` claim). Codes live
 * in the top-level `pairings` collection, which the rules keep from every
 * client. Removing a device deletes its document (the rules check it on
 * every request) and its Auth user (no more token refreshes).
 */

const EXPIRED = 'That code has expired or was already used. Make a new one on the wall.';

function newCode(): string {
  for (;;) {
    const code = codeFromBytes(randomBytes(32));
    if (code) return code;
  }
}

/** The household's pairing codes (one at a time, but a wall may ask again before the last one is used). */
const pairingsOf = (hid: string) => db.collection('pairings').where('hid', '==', hid);

/**
 * A pairing code for the caller's household; one at a time (a new one
 * replaces the last). Codes left expired by any household are cleared here
 * too, so no account lingers in an unused one.
 */
export const createPairing = onCall(opts, async (req) => {
  const { hid, device } = await caller(req);
  if (device) throw new HttpsError('permission-denied', 'Phones are paired from the wall.');
  const account = req.auth?.token?.account;
  if (!allowed(account)) throw new HttpsError('permission-denied', NOT_ALLOWED);
  const code = newCode();
  const now = Date.now();
  const expiresAt = now + PAIRING_TTL_MS;
  await db.runTransaction(async (tx) => {
    const old = await tx.get(pairingsOf(hid));
    for (const d of old.docs) tx.delete(d.ref);
    tx.create(db.doc(`pairings/${code}`), { hid, account, createdAt: now, expiresAt });
  });
  const stale = await db.collection('pairings').where('expiresAt', '<', now).limit(50).get();
  if (!stale.empty) {
    const b = db.batch();
    for (const d of stale.docs) b.delete(d.ref);
    await b.commit();
  }
  return { code, expiresAt };
});

/**
 * Put a code away (the wall's Done, or the page left): it can no longer pair
 * a phone. Only the code named, and only the caller's household's: a cancel
 * that lands late never takes the code the wall made after it.
 */
export const cancelPairing = onCall<{ code?: unknown }>(opts, async (req) => {
  const { hid, device } = await caller(req);
  if (device) throw new HttpsError('permission-denied', 'Phones are paired from the wall.');
  const code = normalizeCode(req.data?.code);
  if (!code) throw new HttpsError('invalid-argument', 'That is not a pairing code.');
  const ref = db.doc(`pairings/${code}`);
  await db.runTransaction(async (tx) => {
    const p = await tx.get(ref);
    if (p.exists && p.get('hid') === hid) tx.delete(ref);
  });
  return {};
});

/*
 * redeemPairing needs no sign-in, so anyone can call it: each instance
 * refuses calls past a rate no family pairing comes near, before any
 * database read, and there is one instance. The emulator, where the tests
 * pair hundreds of phones, has no limit.
 */
const redeemLimit = emulator ? () => true : rateLimiter(30, 15);

/** Pair a phone: trade a code from the wall, once, for the phone's own sign-in. Needs no sign-in. */
export const redeemPairing = onCall<{ code?: unknown; name?: unknown }>({ ...opts, maxInstances: 1 }, async (req) => {
  if (!redeemLimit(Date.now()))
    throw new HttpsError('resource-exhausted', 'Too many pairing attempts just now. Wait a minute and try again.');
  const code = normalizeCode(req.data?.code);
  if (!code) throw new HttpsError('invalid-argument', 'That is not a pairing code: it has 8 letters and digits.');
  const name = deviceName(req.data?.name);
  if (!name) throw new HttpsError('invalid-argument', 'Give this phone a name (up to 40 characters).');
  const ref = db.doc(`pairings/${code}`);
  type Paired = { ok: true; hid: string; account: string; deviceId: string } | { ok: false; error: string };
  const paired = await db.runTransaction(async (tx): Promise<Paired> => {
    const p = await tx.get(ref);
    if (!p.exists) throw new HttpsError('not-found', EXPIRED);
    // A code is used once, also when it turns out to be expired or its household no longer allowed.
    tx.delete(ref);
    const hid = p.get('hid');
    const account = p.get('account');
    if (typeof hid !== 'string' || !(Number(p.get('expiresAt')) > Date.now())) return { ok: false, error: EXPIRED };
    if (!allowed(account)) return { ok: false, error: NOT_ALLOWED };
    const dev = db.collection(`households/${hid}/devices`).doc();
    tx.create(dev, { id: dev.id, name, kind: 'phone', createdAt: Date.now() });
    return { ok: true, hid, account, deviceId: dev.id };
  });
  if (!paired.ok) throw new HttpsError(paired.error === EXPIRED ? 'not-found' : 'permission-denied', paired.error);
  const customToken = await getAuth().createCustomToken(deviceUid(paired.hid, paired.deviceId), {
    hid: paired.hid,
    account: paired.account,
    device: paired.deviceId,
  });
  return { customToken };
});

/** Remove a paired phone: the wall removes any, a phone only itself. */
export const removeDevice = onCall<{ deviceId?: unknown }>(opts, async (req) => {
  const id = req.data?.deviceId;
  if (!isDeviceId(id)) throw new HttpsError('invalid-argument', 'No such phone.');
  const t = req.auth?.token;
  const hid = t?.hid;
  if (typeof hid !== 'string') throw new HttpsError('unauthenticated', 'Sign in first.');
  // A phone unpairing itself may already be removed, so it is not refused for that.
  if (t?.device !== undefined && t.device !== id)
    throw new HttpsError('permission-denied', 'A phone can only unpair itself. Remove other phones at the wall.');
  await deviceDoc(hid, id).delete();
  try {
    await getAuth().deleteUser(deviceUid(hid, id));
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
  }
  return {};
});
