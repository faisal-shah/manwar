import type { ReadOnly } from '../../calendar/types';

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

/** A maps search for an event's location (a phone with Google Maps opens it there). */
export const mapsUrl = (location: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;

/** A name set in a sentence as its own direction (Unicode first-strong isolate, as a <bdi> does). */
const isolate = (s: string) => `\u2068${s}\u2069`;

/** Why an event cannot be changed here, in a sentence (`calendar`: its calendar's name). */
export function readOnlyText(why: ReadOnly, calendar: string, organizer?: string): string {
  switch (why) {
    case 'birthday':
      return 'Birthdays come from Google Contacts: change it there.';
    case 'gmail':
      return 'Gmail added this event from an email, so it cannot be changed here.';
    case 'calendar':
      return `${isolate(calendar)} is shared with the household to read only.`;
    case 'locked':
      return 'This is a locked copy of an event: only its organizer can change it.';
    case 'invited':
      return organizer ? `Only its organizer, ${isolate(organizer)}, can change it.` : 'Only its organizer can change it.';
  }
}
