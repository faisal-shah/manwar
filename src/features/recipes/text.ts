import type { Recipe } from '../../data/types';
import { fold } from '../../lib/text';
import { stripMarker } from '../meals/ingredients';

/**
 * Instructions as numbered steps for reading across the kitchen. Several
 * lines are taken as steps (dropping any "1." / "Step 1:" numbering); a
 * single paragraph is split at sentence ends.
 */
export function instructionSteps(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) =>
      l
        .trim()
        .replace(/^(?:[-–—*•·◦▪]+\s*|(?:step\s*)?\d+\s*[.):-]\s*)/i, '')
        .trim(),
    )
    .filter((l) => l && !/^instructions:?$/i.test(l));
  if (lines.length !== 1) return lines;
  return lines[0]
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Ingredients typed or pasted one per line: bullets and list numbers dropped, blank lines dropped. */
export const ingredientLines = (text: string): string[] => text.split('\n').map(stripMarker).filter(Boolean);

/** Validates an optional source URL typed into the recipe editor. Returns an error message or null. */
export function sourceUrlError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? null : 'Use a web address starting with http:// or https://';
  } catch {
    return 'Use a full web address, e.g. https://example.com/recipe';
  }
}

/** "example.com/recipes/biryani" for showing a source without the scheme. */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** Search: name first, then ingredient matches. Ignores case and diacritics (Arabic harakat, accents). */
export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const q = fold(query.trim());
  const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return sorted;
  const byName = sorted.filter((r) => fold(r.name).includes(q));
  const byIngredient = sorted.filter((r) => !byName.includes(r) && r.ingredients.some((i) => fold(i).includes(q)));
  return [...byName, ...byIngredient];
}
