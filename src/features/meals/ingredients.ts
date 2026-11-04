import type { ListItem } from '../../data/types';
import { itemKey } from '../lists/logic';

/**
 * Recipe ingredients to grocery items. A recipe stores one ingredient per
 * line ("2 lb chicken thighs"); the grocery list keeps the quantity in its
 * own field, so a line splits into quantity and name. Matching against the
 * list uses the name only (lists/logic itemKey), so "2 onions" is a
 * duplicate of an open "Onions" item.
 */

export interface ParsedIngredient {
  /** The line as written, minus any bullet. */
  line: string;
  qty?: string;
  /** Grocery item text: the line without its quantity, first letter capitalized. */
  name: string;
}

const FRAC = '[¼½¾⅓⅔⅛⅜⅝⅞]';
const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?\\s*${FRAC}?|${FRAC})`;
const QTY = `${NUM}(?:\\s*(?:-|–|to)\\s*${NUM})?`;
const UNITS = [
  'cups?',
  'tbsps?',
  'tbs',
  'tablespoons?',
  'tsps?',
  'teaspoons?',
  'lbs?',
  'pounds?',
  'oz',
  'ounces?',
  'g',
  'grams?',
  'kg',
  'kilograms?',
  'ml',
  'l',
  'lit(?:er|re)s?',
  'qts?',
  'quarts?',
  'pints?',
  'gal',
  'gallons?',
  'cloves?',
  'cans?',
  'jars?',
  'bags?',
  'box(?:es)?',
  'bottles?',
  'packages?',
  'pkgs?',
  'packets?',
  'pinch(?:es)?',
  'dash(?:es)?',
  'slices?',
  'bunch(?:es)?',
  'heads?',
  'sticks?',
  'pieces?',
  'sprigs?',
  'handfuls?',
  'dozen',
].join('|');

const WITH_NUMBER = new RegExp(`^(${QTY})\\s*(?:(${UNITS})\\.?(?![\\p{L}]))?\\s*(?:of\\s+)?(.*)$`, 'iu');
const MEASURE_ONLY = /^((?:an?\s+)?(?:pinch|dash|handful|splash|sprinkle)(?:es|s)?)\s+of\s+(.+)$/i;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Split an ingredient line into quantity and name. Null for blank lines and headers ("Ingredients:"). */
export function parseIngredient(raw: string): ParsedIngredient | null {
  const line = raw.replace(/^\s*[-*•·]\s*/, '').trim();
  if (!line || line.endsWith(':')) return null;
  const m = WITH_NUMBER.exec(line);
  if (m && m[3].trim()) {
    const qty = [m[1].trim(), m[2]].filter(Boolean).join(' ');
    return { line, qty, name: capitalize(m[3].trim()) };
  }
  const p = MEASURE_ONLY.exec(line);
  if (p) return { line, qty: capitalize(p[1]), name: capitalize(p[2].trim()) };
  return { line, name: capitalize(line) };
}

export type IngredientStatus = 'new' | 'reopen' | 'onList';

export interface IngredientRow extends ParsedIngredient {
  key: string;
  status: IngredientStatus;
  /** For 'reopen': the checked-off item that comes back; for 'onList': the open item. */
  itemId?: string;
}

/**
 * Classify each ingredient against a grocery list: already open on it,
 * checked off earlier (adding it reopens that item, keeping its section),
 * or new. Repeated lines collapse to the first.
 */
export function classifyIngredients(lines: string[], existing: ListItem[]): IngredientRow[] {
  const open = new Map<string, ListItem>();
  const done = new Map<string, ListItem>();
  for (const it of existing) {
    const k = itemKey(it.text);
    if (!it.done) open.set(k, it);
    else if (!done.has(k) || (it.doneAt ?? 0) > (done.get(k)!.doneAt ?? 0)) done.set(k, it);
  }
  const seen = new Set<string>();
  const rows: IngredientRow[] = [];
  for (const raw of lines) {
    const p = parseIngredient(raw);
    if (!p) continue;
    const key = itemKey(p.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const o = open.get(key);
    const d = done.get(key);
    if (o) rows.push({ ...p, key, status: 'onList', itemId: o.id });
    else if (d) rows.push({ ...p, key, status: 'reopen', itemId: d.id });
    else rows.push({ ...p, key, status: 'new' });
  }
  return rows;
}
