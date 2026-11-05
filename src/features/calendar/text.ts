/** Pure text helpers for event fields (tests/unit/calendar-form.test.ts). */

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Google descriptions written in its web editor are HTML (<br>, lists,
 * links, entities); show them as plain text. Entities are decoded in one
 * pass, so "&amp;lt;" stays the literal text "&lt;".
 */
export function plainText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h\d|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
