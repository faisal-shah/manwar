import type { Recipe } from '../../data/types';

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
        .replace(/^(?:step\s*)?\d+\s*[.):-]\s*/i, '')
        .trim(),
    )
    .filter((l) => l && !/^instructions:?$/i.test(l));
  if (lines.length !== 1) return lines;
  return lines[0]
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Ingredients typed one per line, blank lines dropped. */
export const ingredientLines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

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

/** Search: name first, then ingredient matches. Case-insensitive. */
export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const q = query.trim().toLowerCase();
  const sorted = [...recipes].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return sorted;
  const byName = sorted.filter((r) => r.name.toLowerCase().includes(q));
  const byIngredient = sorted.filter((r) => !byName.includes(r) && r.ingredients.some((i) => i.toLowerCase().includes(q)));
  return [...byName, ...byIngredient];
}
