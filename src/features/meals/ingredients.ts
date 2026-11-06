import type { ListItem } from '../../data/types';
import { itemKey, itemsByKey } from '../lists/logic';

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

// A quantity is followed by a unit or by a space: "2% milk" and "7up" are names.
const WITH_NUMBER = new RegExp(`^(${QTY})(?:\\s*(${UNITS})\\.?(?![\\p{L}])|(?=\\s))\\s*(?:of\\s+)?(.*)$`, 'iu');
const MEASURE_ONLY = /^((?:an?\s+)?(?:pinch|dash|handful|splash|sprinkle)(?:es|s)?)\s+of\s+(.+)$/i;
/** Pasted-list markers: bullets, check boxes and "1." / "2)" numbering (not "1.5 cups"). */
const MARKER = /^\s*(?:[-–—*•·◦▪▫■□●○✓✔☐☑]+\s*|\[[ xX]?\]\s*|\d{1,2}[.)]\s+)+/u;
const HEADING = /^(?:ingredients|instructions|directions|method)$/i;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A line without its leading bullet, check box or list number. */
export const stripMarker = (raw: string): string => raw.replace(MARKER, '').trim();

/** Lines that head a group rather than name an ingredient: "For the sauce:", "Ingredients". */
export const isHeading = (line: string): boolean => line.endsWith(':') || HEADING.test(line);

/** Split an ingredient line into quantity and name. Null for blank lines and headings. */
export function parseIngredient(raw: string): ParsedIngredient | null {
  const line = stripMarker(raw);
  if (!line || isHeading(line)) return null;
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
}

/**
 * Classify each ingredient against a grocery list (lists/logic itemsByKey,
 * the rule adding an item follows): already open on it, checked off
 * earlier (adding it reopens that item, keeping its section), or new.
 * Repeated lines collapse to the first. For showing: the merge decides
 * again from the list as it is when the rows are added.
 */
export function classifyIngredients(lines: string[], existing: ListItem[]): IngredientRow[] {
  const keyed = itemsByKey(existing);
  const seen = new Set<string>();
  const rows: IngredientRow[] = [];
  for (const raw of lines) {
    const p = parseIngredient(raw);
    if (!p) continue;
    const key = itemKey(p.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const { open, done } = keyed.get(key) ?? {};
    rows.push({ ...p, key, status: open ? 'onList' : done ? 'reopen' : 'new' });
  }
  return rows;
}
