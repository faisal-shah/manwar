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
