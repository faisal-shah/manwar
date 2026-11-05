/**
 * Where a device remembers the last household it opened (data/session.ts:
 * `{ uid, hid, account?, device? }`); app/layout.ts reads it to keep a
 * device signed in as the wall a wall.
 */
export const HOUSEHOLD_KEY = 'manwar.claims.v1';
