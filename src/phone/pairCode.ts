/** A pairing code as shown and typed: "ABCD-EFGH" (the Function accepts it with or without the dash). */
export function formatPairCode(raw: string): string {
  const s = raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 8);
  return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}
