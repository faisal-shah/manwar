import type { GroceryMemory } from '../../data/types';
import { parseIngredient } from '../meals/ingredients';
import { itemWords, singular } from './logic';

/**
 * Grocery suggestions as an item is typed (pure, unit-tested): the
 * household's remembered items (`groceryMemory`) that match the words
 * typed.
 *
 * Matching suits short item names: every word typed must match a word of
 * the item (the last one typed is usually half a word, so a word that
 * starts with it matches; the same word in the plural matches too; from
 * four letters a one-letter slip still matches). Words are read as item
 * keys read them (itemWords): case, accents, Arabic diacritics and the
 * Arabic article are ignored.
 *
 * Ranking: first the items whose name starts with what is typed (the
 * first word typed matches the item's first word by its start), then the
 * rest. People type an item's name from its start, so with "b" typed
 * "brown sugar" is above "chicken breast" however often the chicken is
 * bought: a short prefix matches many items, and a list that put a later
 * word's match first would look random. Within each group one score
 * orders them: how closely the words match, less a little for each word
 * of the item nothing typed asks for, plus how often and how lately it
 * was added, so the household's usual item comes first among those that
 * match about as well ("egg": the eggplant bought every week before the
 * eggs bought once last spring).
 */

/** At most this many suggestions show. */
export const SUGGESTIONS = 8;

/**
 * A grocery list's Add item text read as an item: a leading quantity is
 * kept apart from the name ("2 gal milk", "1 dozen eggs"), as on the list.
 */
export function typedItem(text: string): { name: string; qty?: string } {
  const p = parseIngredient(text);
  return p ? { name: p.name, qty: p.qty } : { name: text.trim() };
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

/** A word typed that matches at least this well matches by the word's start (or is the word). */
const BY_START = 0.75;

/**
 * How well the typed words match an item's words, 0 when one of them
 * matches nothing: the closeness of each, less 0.03 for each word of the
 * item nothing typed asks for (at most 0.15).
 */
export function matchScore(typed: string[], item: string[]): number {
  if (!typed.length || !item.length) return 0;
  let sum = 0;
  for (const t of typed) {
    const best = Math.max(...item.map((w) => wordMatch(t, w)));
    if (!best) return 0;
    sum += best;
  }
  return sum / typed.length - Math.min(0.15, 0.03 * Math.max(0, item.length - typed.length));
}

/** The item's name starts with what is typed: its first word matches the first word typed by its start. */
export const startsWithTyped = (typed: string[], item: string[]): boolean =>
  !!typed.length && !!item.length && wordMatch(typed[0], item[0]) >= BY_START;

const DAY_MS = 86_400_000;

/** How much an item is used, 0..1: how often it was added (against the most added) and how lately. */
function usage(m: GroceryMemory, mostAdded: number, now: number): number {
  const often = Math.log1p(m.count) / Math.log1p(Math.max(1, mostAdded));
  const lately = Math.exp(-Math.max(0, now - m.lastAt) / (45 * DAY_MS));
  return 0.6 * often + 0.4 * lately;
}

export interface Suggestion {
  memory: GroceryMemory;
  /** The name starts with what is typed (ranked above those that do not). */
  starts: boolean;
  score: number;
}

/** The remembered items that match `name` (an item's name as typed, without a quantity), best first; nothing for nothing typed. */
export function suggest(name: string, memory: readonly GroceryMemory[], now: number, limit = SUGGESTIONS): Suggestion[] {
  const t = itemWords(name);
  if (!t.length) return [];
  const mostAdded = Math.max(1, ...memory.map((m) => m.count));
  return memory
    .flatMap((m) => {
      const words = itemWords(m.text);
      const match = matchScore(t, words);
      return match ? [{ memory: m, starts: startsWithTyped(t, words), score: match + 0.3 * usage(m, mostAdded, now) }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.starts) - Number(a.starts) ||
        b.score - a.score ||
        a.memory.text.length - b.memory.text.length ||
        a.memory.text.localeCompare(b.memory.text),
    )
    .slice(0, limit);
}
