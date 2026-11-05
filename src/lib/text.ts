/**
 * Text folded for matching: lower case, without diacritics (Latin accents,
 * Arabic harakat, hamza seats) and without the Arabic tatweel, so
 * "Crème" finds "creme" and "حليب" finds "حَلِيب".
 */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\p{M}ـ]/gu, '')
    .toLowerCase();

/**
 * A name set in a sentence as its own direction (Unicode first-strong
 * isolate, as a <bdi> does), for text that cannot hold markup (a dialog
 * title, a toast): an Arabic name keeps its "!" and digits on its own side.
 */
export const isolate = (s: string): string => `\u2068${s}\u2069`;

/** The noun for a count: the singular for exactly 1, the plural otherwise (0 included); `many` for irregular plurals. */
export const pluralWord = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** A count with its noun, grouped by locale: "1 star", "0 stars", "1,250 stars". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString()} ${pluralWord(n, one, many)}`;
