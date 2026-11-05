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

/** Firestore values for plain strings, numbers and maps. */
type Plain = string | number | { [k: string]: Plain };
const value = (v: Plain): object =>
  typeof v === 'string'
    ? { stringValue: v }
    : typeof v === 'number'
      ? { integerValue: String(v) }
      : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } };
const fields = (o: Record<string, Plain>) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)])) });
const put = (who: Who, path: string, o: Record<string, Plain>) => req(who, 'PATCH', path, fields(o));
/** Write only `paths` of `o` (a path missing from `o` deletes that field), as the SDK's update does. */
const update = (who: Who, path: string, o: Record<string, Plain>, paths: string[]) =>
  req(who, 'PATCH', `${path}?${paths.map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join('&')}`, fields(o));
const name = (path: string) => `projects/${PROJECT}/databases/(default)/documents/${path}`;
/** One write of an atomic batch, as the SDK sends it: a whole document, a delete, or a star balance changed by `delta`. */
type Write = { set: string; data: Record<string, Plain> } | { remove: string } | { stars: string; delta: number };
const encode = (w: Write) =>
  'set' in w
    ? { update: { name: name(w.set), ...fields(w.data) } }
    : 'remove' in w
      ? { delete: name(w.remove) }
      : {
          update: { name: name(w.stars), fields: {} },
          updateMask: { fieldPaths: [] },
          updateTransforms: [{ fieldPath: 'stars', increment: { integerValue: String(w.delta) } }],
          currentDocument: { exists: true },
        };
async function commit(who: Who, writes: Write[]): Promise<number> {
  const res = await fetch(`${DOCS}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who}` },
    body: JSON.stringify({ writes: writes.map(encode) }),
  });
  await res.text();
  return res.status;
}
/** A number field on the server (rules bypassed). */
async function num(path: string, field: string): Promise<number | null> {
  const res = await fetch(`${DOCS}/${path}`, { headers: { Authorization: 'Bearer owner' } });
  if (res.status !== 200) return null;
  const v = ((await res.json()) as { fields: Record<string, { integerValue?: string }> }).fields[field];
  return v?.integerValue === undefined ? null : Number(v.integerValue);
}

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

/*
 * Stars. A device writes a check-off, its ledger entry and the balance in
 * one batch, decided from its own copy; a phone offline decides from a
 * stale one. Each test has its own documents in household A.
 */
const H = (path: string) => `households/${A}/${path}`;
const entry = (id: string, profileId: string, delta: number, reason: string) => ({
  set: H(`ledger/${id}`),
  data: { id, profileId, delta, reason, label: 'Breakfast', at: 1 },
});
const checkOff = (state: string, ledger: string, profile: string, stars: number): Write[] => [
  { set: H(`taskStates/${state}`), data: { id: state, taskId: 't', profileId: profile, by: profile, status: 'done', stars } },
  entry(ledger, profile, stars, 'task'),
  { stars: H(`profiles/${profile}`), delta: stars },
];
const uncheck = (state: string, ledger: string, profile: string, stars: number): Write[] => [
  { remove: H(`taskStates/${state}`) },
  entry(ledger, profile, -stars, 'untask'),
  { stars: H(`profiles/${profile}`), delta: -stars },
];

test('a task state is only created and deleted: never written over, never deleted twice', async () => {
  const t = tablet(A);
  expect(await put(t, H('taskStates/s1'), { id: 's1', status: 'done' })).toBe(200);
  expect(await put(t, H('taskStates/s1'), { id: 's1', status: 'skipped' })).toBe(403);
  expect(await update(t, H('taskStates/s1'), { status: 'skipped' }, ['status'])).toBe(403);
  expect(await req(t, 'DELETE', H('taskStates/s1'))).toBe(200);
  expect(await req(t, 'DELETE', H('taskStates/s1'))).toBe(403);
  // Made again after the delete: a new check-off.
  expect(await put(phone(A, PHONE), H('taskStates/s1'), { id: 's1', status: 'done' })).toBe(200);
  expect(await read(phone(A, PHONE), H('taskStates/s1'))).toBe(200);
});

test('a check-off or uncheck made twice (a phone that was offline) is refused whole', async () => {
  expect(await put('owner', H('profiles/kid1'), { id: 'kid1', stars: 10 })).toBe(200);
  expect(await commit(tablet(A), checkOff('s2', 'l2a', 'kid1', 2))).toBe(200);
  expect(await num(H('profiles/kid1'), 'stars')).toBe(12);
  // No second entry, no second award.
  expect(await commit(phone(A, PHONE), checkOff('s2', 'l2b', 'kid1', 2))).toBe(403);
  expect(await num(H('profiles/kid1'), 'stars')).toBe(12);
  expect(await read('owner', H('ledger/l2b'))).toBe(404);
  // Unchecked here, then again from a phone that had not heard: no second take-back.
  expect(await commit(tablet(A), uncheck('s2', 'l2c', 'kid1', 2))).toBe(200);
  expect(await commit(phone(A, PHONE), uncheck('s2', 'l2d', 'kid1', 2))).toBe(403);
  expect(await num(H('profiles/kid1'), 'stars')).toBe(10);
});

test('a ledger entry is added, and marked undone once; never otherwise changed or deleted', async () => {
  const t = tablet(A);
  expect(await commit(t, [entry('l3', 'p1', 5, 'give')])).toBe(200);
  expect(await update(t, H('ledger/l3'), { undoneAt: 7 }, ['undoneAt'])).toBe(200);
  // The same undo from a device that had not heard of the first: refused.
  expect(await update(phone(A, PHONE), H('ledger/l3'), { undoneAt: 8 }, ['undoneAt'])).toBe(403);
  expect(await commit(t, [entry('l4', 'p1', 5, 'give')])).toBe(200);
  expect(await update(t, H('ledger/l4'), { delta: 50 }, ['delta'])).toBe(403);
  expect(await commit(t, [entry('l4', 'p1', 50, 'give')])).toBe(403);
  expect(await req(t, 'DELETE', H('ledger/l4'))).toBe(403);
  expect(await num(H('ledger/l4'), 'delta')).toBe(5);
});

test('a redemption may not take the balance below zero; a take-back or a removal may', async () => {
  expect(await put('owner', H('profiles/kid2'), { id: 'kid2', stars: 100 })).toBe(200);
  const spend = (ledger: string, reason: string, delta: number): Write[] => [
    entry(ledger, 'kid2', delta, reason),
    { stars: H('profiles/kid2'), delta },
  ];
  expect(await commit(tablet(A), spend('l5a', 'redeem', -75))).toBe(200);
  // The same reward from a phone that still saw 100 stars.
  expect(await commit(phone(A, PHONE), spend('l5b', 'redeem', -75))).toBe(403);
  expect(await num(H('profiles/kid2'), 'stars')).toBe(25);
  expect(await commit(tablet(A), spend('l5c', 'redeem', -25))).toBe(200);
  expect(await num(H('profiles/kid2'), 'stars')).toBe(0);
  // Unchecking stars already spent, or a parent removing stars, is the parent's call.
  expect(await commit(tablet(A), spend('l5d', 'untask', -10))).toBe(200);
  expect(await commit(tablet(A), spend('l5e', 'remove', -5))).toBe(200);
  expect(await num(H('profiles/kid2'), 'stars')).toBe(-15);
});

test("a one-time reward's redemption is never written over; an undo removes it", async () => {
  const t = tablet(A);
  expect(await put('owner', H('rewards/r1'), { id: 'r1', title: 'New book', cost: 150, redeemedBy: {} })).toBe(200);
  expect(await update(t, H('rewards/r1'), { redeemedBy: { kid3: 5 } }, ['redeemedBy.kid3'])).toBe(200);
  // Redeemed again by a phone that had not heard: refused.
  expect(await update(phone(A, PHONE), H('rewards/r1'), { redeemedBy: { kid3: 6 } }, ['redeemedBy.kid3'])).toBe(403);
  expect(await update(t, H('rewards/r1'), { redeemedBy: { kid4: 6 } }, ['redeemedBy.kid4'])).toBe(200);
  expect(await update(t, H('rewards/r1'), {}, ['redeemedBy.kid3'])).toBe(200);
  expect(await update(t, H('rewards/r1'), { title: 'Two new books', cost: 200 }, ['title', 'cost'])).toBe(200);
  // A reward written before redeemedBy was kept, edited and deleted.
  expect(await put('owner', H('rewards/r2'), { id: 'r2', title: 'Ice cream trip', cost: 50 })).toBe(200);
  expect(await update(t, H('rewards/r2'), { cost: 40 }, ['cost'])).toBe(200);
  expect(await req(t, 'DELETE', H('rewards/r2'))).toBe(200);
});
