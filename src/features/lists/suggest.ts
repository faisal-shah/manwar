import type { GroceryMemory } from '../../data/types';
import { fold } from '../../lib/text';
import { singular } from './logic';

/**
 * Grocery suggestions as an item is typed (pure, unit-tested): the
 * household's remembered items (`groceryMemory`) ranked by how well they
 * match the words typed, then by how often and how lately each was added.
 *
 * Matching suits short item names: every word typed must match a word of
 * the item (the last one typed is usually half a word, so a word that
 * starts with it matches; the same word in the plural matches too; from
 * four letters a one-letter slip still matches). Case, accents, Arabic
 * diacritics and the Arabic article (ال) are ignored.
 */

/** At most this many suggestions show. */
export const SUGGESTIONS = 8;

/** The words of a text for matching. */
export function words(text: string): string[] {
  return fold(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w));
}

/** Within one edit (a letter added, dropped, changed, or two swapped). */
function oneSlip(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** How well a typed word matches an item's word, 0 for not at all. */
function wordMatch(typed: string, word: string): number {
  if (word === typed || singular(word) === singular(typed)) return 1;
  if (word.startsWith(typed)) return 0.75 + 0.2 * (typed.length / word.length);
  if (typed.length >= 3 && word.includes(typed)) return 0.45;
  if (typed.length >= 4) {
    // A slip in what is typed so far: against the word's start of about the same length, or the whole word.
    for (const n of [typed.length - 1, typed.length, typed.length + 1])
      if (oneSlip(typed, word.slice(0, n)) || oneSlip(typed, word)) return 0.35;
  }
  return 0;
}

/** How well the typed words match an item's, 0 when one of them matches nothing. */
export function matchScore(typed: string[], item: string[]): number {
  if (!typed.length || !item.length) return 0;
  let sum = 0;
  for (const t of typed) {
    const best = Math.max(...item.map((w) => wordMatch(t, w)));
    if (!best) return 0;
    sum += best;
  }
  let score = sum / typed.length;
  // The item's first word is the one typed first: "filter jug" before "hanging file folders" for "fil".
  if (wordMatch(typed[0], item[0]) >= 0.75) score += 0.15;
  // Words of the item nothing typed asks for: "fish fillets" before "wild caught fish fillet - cod, salmon".
  score -= Math.min(0.15, 0.03 * Math.max(0, item.length - typed.length));
  return score;
}

const DAY_MS = 86_400_000;

/** How much an item is used, 0..1: how often it was added (against the most added) and how lately. */
function usage(m: GroceryMemory, mostAdded: number, now: number): number {
  const often = Math.log1p(m.count) / Math.log1p(Math.max(1, mostAdded));
  const lately = Math.exp(-Math.max(0, now - m.lastAt) / (45 * DAY_MS));
  return 0.6 * often + 0.4 * lately;
}

export interface Suggestion {
  memory: GroceryMemory;
  score: number;
}

/** The remembered items that match `typed`, best first (nothing for nothing typed). */
export function suggest(typed: string, memory: readonly GroceryMemory[], now: number, limit = SUGGESTIONS): Suggestion[] {
  const t = words(typed);
  if (!t.length) return [];
  const mostAdded = Math.max(1, ...memory.map((m) => m.count));
  return memory
    .flatMap((m) => {
      const match = matchScore(t, words(m.text));
      return match ? [{ memory: m, score: match + 0.3 * usage(m, mostAdded, now) }] : [];
    })
    .sort(
      (a, b) => b.score - a.score || a.memory.text.length - b.memory.text.length || a.memory.text.localeCompare(b.memory.text),
    )
    .slice(0, limit);
}
