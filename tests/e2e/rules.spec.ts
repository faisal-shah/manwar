import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * Firestore rules against the emulator's REST API. The emulator accepts
 * unsigned ID tokens and evaluates the rules with their claims, so each
 * request can be any tablet; `Bearer owner` bypasses the rules for setup.
 * The repo's firestore.rules are loaded first, so this tests the file, not
 * whatever the running emulator had.
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const PROJECT = 'demo-manwar';
const DOCS = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const RUN = Date.now().toString(36);
const A = `rules-a-${RUN}`;
const B = `rules-b-${RUN}`;

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** An emulator ID token for a tablet signed in to household `hid` (or with no hid claim). */
function idToken(uid: string, claims: Record<string, unknown>): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    iat,
    exp: iat + 3600,
    auth_time: iat,
    sub: uid,
    user_id: uid,
    firebase: { sign_in_provider: 'custom', identities: {} },
    ...claims,
  };
  return `${b64({ alg: 'none', kid: 'fakekid', typ: 'JWT' })}.${b64(payload)}.`;
}

type Who = 'owner' | 'anon' | string;
const tablet = (hid: string) => idToken(hid, { hid });
/** A phone paired to `hid` as device `device` (its devices/ document may or may not exist). */
const phone = (hid: string, device: string) => idToken(`${hid}.phone.${device}`, { hid, device });
const PHONE = 'phoneAAAAAAAAAAAAAAA';
const GONE = 'goneBBBBBBBBBBBBBBBB';

async function req(who: Who, method: string, path: string, body?: object): Promise<number> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (who !== 'anon') headers.Authorization = `Bearer ${who}`;
  const res = await fetch(`${DOCS}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  await res.text();
  return res.status;
}

const doc = (fields: Record<string, string>) => ({
  fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])),
});
const read = (who: Who, path: string) => req(who, 'GET', path);
const write = (who: Who, path: string) => req(who, 'PATCH', path, doc({ name: 'x' }));

test.beforeAll(async () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  const res = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT',
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }),
  });
  expect(res.status).toBe(200);
  for (const hid of [A, B]) {
    expect(await req('owner', 'PATCH', `households/${hid}`, doc({ account: `${hid}@example.com` }))).toBe(200);
    expect(await write('owner', `households/${hid}/profiles/p1`)).toBe(200);
    expect(await req('owner', 'PATCH', `households/${hid}/private/google`, doc({ refreshToken: 'secret' }))).toBe(200);
  }
  expect(
    await req('owner', 'PATCH', `households/${A}/devices/${PHONE}`, {
      fields: { id: { stringValue: PHONE }, name: { stringValue: 'Phone' }, lastSeenAt: { integerValue: '1' } },
    }),
  ).toBe(200);
  expect(await write('owner', `households/${A}/devices/other0000000000000000`)).toBe(200);
  expect(await req('owner', 'PATCH', `pairings/ABCDEFGH`, doc({ hid: A }))).toBe(200);
});

test('a household reads and writes its own collections', async () => {
  expect(await read(tablet(A), `households/${A}/profiles/p1`)).toBe(200);
  expect(await write(tablet(A), `households/${A}/profiles/p2`)).toBe(200);
  expect(await write(tablet(A), `households/${A}/settings/main`)).toBe(200);
  expect(await req(tablet(A), 'DELETE', `households/${A}/profiles/p2`)).toBe(200);
  expect(await read(tablet(A), `households/${A}`)).toBe(200);
});

test('a household cannot read or write another household', async () => {
  expect(await read(tablet(A), `households/${B}/profiles/p1`)).toBe(403);
  expect(await read(tablet(A), `households/${B}/profiles`)).toBe(403);
  expect(await read(tablet(A), `households/${B}`)).toBe(403);
  expect(await write(tablet(A), `households/${B}/profiles/p9`)).toBe(403);
  expect(await req(tablet(A), 'DELETE', `households/${B}/profiles/p1`)).toBe(403);
  // Listing every household is not allowed either.
  expect(await read(tablet(A), 'households')).toBe(403);
});

test('nobody reaches households/*/private, not even the household itself', async () => {
  expect(await read(tablet(A), `households/${A}/private/google`)).toBe(403);
  expect(await read(tablet(A), `households/${A}/private`)).toBe(403);
  expect(await write(tablet(A), `households/${A}/private/google`)).toBe(403);
  expect(await req(tablet(A), 'DELETE', `households/${A}/private/google`)).toBe(403);
});

test('the household document itself is written only by the Functions', async () => {
  expect(await write(tablet(A), `households/${A}`)).toBe(403);
  expect(await req(tablet(A), 'DELETE', `households/${A}`)).toBe(403);
});

test('unauthenticated requests and tokens without a household are denied', async () => {
  expect(await read('anon', `households/${A}/profiles/p1`)).toBe(403);
  expect(await write('anon', `households/${A}/profiles/p3`)).toBe(403);
  const noHid = idToken('someone', {});
  expect(await read(noHid, `households/${A}/profiles/p1`)).toBe(403);
  // A hid claim of the wrong type matches nothing.
  expect(await read(idToken('someone', { hid: [A] }), `households/${A}/profiles/p1`)).toBe(403);
});

test('nothing outside the household collections is open', async () => {
  expect(await read(tablet(A), `households/${A}/profiles/p1/sub/x`)).toBe(403);
  expect(await write(tablet(A), `households/${A}/profiles/p1/sub/x`)).toBe(403);
  expect(await write(tablet(A), `other/${A}`)).toBe(403);
  expect(await write(tablet(A), '_ids/x')).toBe(403);
});

test('a paired phone is a member of its household while its device document exists', async () => {
  const p = phone(A, PHONE);
  expect(await read(p, `households/${A}`)).toBe(200);
  expect(await read(p, `households/${A}/profiles/p1`)).toBe(200);
  expect(await write(p, `households/${A}/profiles/p4`)).toBe(200);
  expect(await req(p, 'DELETE', `households/${A}/profiles/p4`)).toBe(200);
  expect(await read(p, `households/${A}/devices/${PHONE}`)).toBe(200);
  expect(await read(p, `households/${B}/profiles/p1`)).toBe(403);
  expect(await read(p, `households/${A}/private/google`)).toBe(403);
});

test('a removed phone (no device document) is refused everywhere at once', async () => {
  const p = phone(A, GONE);
  expect(await read(p, `households/${A}`)).toBe(403);
  expect(await read(p, `households/${A}/profiles/p1`)).toBe(403);
  expect(await write(p, `households/${A}/profiles/p5`)).toBe(403);
  expect(await read(p, `households/${A}/devices/${PHONE}`)).toBe(403);
  // A device claim that is not a string matches no document either.
  expect(await read(idToken('x', { hid: A, device: [PHONE] }), `households/${A}/profiles/p1`)).toBe(403);
});

test('devices are written by the Functions; a phone only stamps its own lastSeenAt', async () => {
  const p = phone(A, PHONE);
  const seen = (n: string) => ({ fields: { lastSeenAt: { integerValue: n } } });
  const mask = '?updateMask.fieldPaths=lastSeenAt';
  expect(await req(p, 'PATCH', `households/${A}/devices/${PHONE}${mask}`, seen('2'))).toBe(200);
  expect(await req(p, 'PATCH', `households/${A}/devices/${PHONE}${mask}`, { fields: { lastSeenAt: { stringValue: 'x' } } })).toBe(
    403,
  );
  expect(await req(p, 'PATCH', `households/${A}/devices/other0000000000000000${mask}`, seen('2'))).toBe(403);
  expect(await req(p, 'PATCH', `households/${A}/devices/${PHONE}?updateMask.fieldPaths=name`, doc({ name: 'Mine' }))).toBe(403);
  expect(await req(p, 'DELETE', `households/${A}/devices/${PHONE}`)).toBe(403);
  expect(await write(p, `households/${A}/devices/newAAAAAAAAAAAAAAAAA`)).toBe(403);
  // The wall cannot add, rename or remove devices directly either.
  expect(await write(tablet(A), `households/${A}/devices/newAAAAAAAAAAAAAAAAA`)).toBe(403);
  expect(await req(tablet(A), 'PATCH', `households/${A}/devices/${PHONE}${mask}`, seen('3'))).toBe(403);
  expect(await req(tablet(A), 'DELETE', `households/${A}/devices/${PHONE}`)).toBe(403);
  expect(await read(tablet(A), `households/${A}/devices/${PHONE}`)).toBe(200);
});

test("pairing codes are out of every client's reach", async () => {
  expect(await read(tablet(A), 'pairings/ABCDEFGH')).toBe(403);
  expect(await read(phone(A, PHONE), 'pairings/ABCDEFGH')).toBe(403);
  expect(await read('anon', 'pairings/ABCDEFGH')).toBe(403);
  expect(await write(tablet(A), 'pairings/ZZZZZZZZ')).toBe(403);
  expect(await read(tablet(A), 'pairings')).toBe(403);
});
