/**
 * Phone pairing, the pure parts (unit-tested in pairing.test.ts).
 *
 * A signed-in wall asks for a pairing code; a phone that presents the code
 * within PAIRING_TTL_MS, once, becomes a device of that household with its
 * own sign-in. Codes come from an alphabet without
 * look-alike characters (no 0/O, 1/I/L), so one read off the wall and typed
 * on a phone is not mistyped.
 */

export const PAIR_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const PAIR_CODE_LENGTH = 8;
export const PAIRING_TTL_MS = 10 * 60_000;
export const DEVICE_NAME_MAX = 40;

/** A code from random bytes (one per character, some skipped); null when the bytes run out first. */
export function codeFromBytes(bytes: Uint8Array): string | null {
  const n = PAIR_ALPHABET.length;
  // Rejection sampling keeps every character equally likely: 256 is not a multiple of 31.
  const limit = 256 - (256 % n);
  let out = '';
  for (const b of bytes) {
    if (b >= limit) continue;
    out += PAIR_ALPHABET[b % n];
    if (out.length === PAIR_CODE_LENGTH) return out;
  }
  return null;
}

/** A code as typed or scanned (case, spaces and dashes do not matter); null when it cannot be a code. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== PAIR_CODE_LENGTH) return null;
  return [...s].every((c) => PAIR_ALPHABET.includes(c)) ? s : null;
}

/** A device's name ("Mamma's phone"): trimmed, 1 to DEVICE_NAME_MAX characters. Null when unusable. */
export function deviceName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.replace(/\s+/g, ' ').trim();
  return s.length >= 1 && [...s].length <= DEVICE_NAME_MAX ? s : null;
}

/** A device id: 20 letters and digits, as Firestore auto ids are. */
export const isDeviceId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9]{20}$/.test(id);

/** The Firebase Auth user of a paired device: per device, so removing one signs out only that one. */
export const deviceUid = (hid: string, deviceId: string) => `${hid}.phone.${deviceId}`;

/**
 * A token bucket: up to `burst` calls at once, refilled at `perMinute`.
 * `take(now)` spends one and says whether there was one to spend.
 */
export function rateLimiter(perMinute: number, burst: number): (now: number) => boolean {
  let tokens = burst;
  let at = -Infinity;
  return (now) => {
    tokens = Math.min(burst, tokens + ((now - at) * perMinute) / 60_000);
    at = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
