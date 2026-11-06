import { PAIR_CODE_LENGTH } from '../../functions/src/pairing';

/** The pairing rules the Functions apply (functions/src/pairing.ts), so the form asks for what they accept. */
export { DEVICE_NAME_MAX } from '../../functions/src/pairing';

/** A pairing code as shown and typed: "ABCD-EFGH" (the Function accepts it with or without the dash). */
export function formatPairCode(raw: string): string {
  const s = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, PAIR_CODE_LENGTH);
  const half = PAIR_CODE_LENGTH / 2;
  return s.length > half ? `${s.slice(0, half)}-${s.slice(half)}` : s;
}

/** A complete code typed (the dash aside). */
export const isFullPairCode = (shown: string) => shown.replace('-', '').length === PAIR_CODE_LENGTH;
