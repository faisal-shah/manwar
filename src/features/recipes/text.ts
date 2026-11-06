import type { Recipe } from '../../data/types';
import { fold } from '../../lib/text';
import { isHeading, stripMarker } from '../meals/ingredients';

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

/**
 * Ingredient lines for display: markers dropped, "For the sauce:" lines as
 * headings (without the colon), and a leading "Ingredients" heading dropped,
 * since the column already says so.
 */
export function ingredientRows(lines: string[]): { text: string; heading: boolean }[] {
  const rows = lines
    .map(stripMarker)
    .filter(Boolean)
    .map((l) => (isHeading(l) ? { text: l.replace(/:$/, '').trim(), heading: true } : { text: l, heading: false }));
  return rows[0]?.heading && /^ingredients$/i.test(rows[0].text) ? rows.slice(1) : rows;
}

/** Ingredients typed or pasted one per line: bullets and list numbers dropped, blank lines dropped. */
export const ingredientLines = (text: string): string[] => text.split('\n').map(stripMarker).filter(Boolean);

/** A recipe as an editor saves it. */
export type RecipeDraft = Omit<Recipe, 'id' | 'createdAt'>;

/** What the recipe editor's fields hold. */
export interface RecipeFields {
  name: string;
  emoji?: string;
  category: Recipe['category'];
  /** 0: not set. */
  servings: number;
  /** One per line. */
  ingredients: string;
  instructions: string;
  url: string;
}

/** The editor's fields for a recipe, or for a new one. */
export const recipeFields = (r?: Recipe): RecipeFields => ({
  name: r?.name ?? '',
  emoji: r?.emoji,
  category: r?.category ?? 'dinner',
  servings: r?.servings ?? 0,
  ingredients: r?.ingredients.join('\n') ?? '',
  instructions: r?.instructions ?? '',
  url: r?.sourceUrl ?? '',
});

/** The recipe the editor's fields describe. */
export const recipeDraft = (f: RecipeFields): RecipeDraft => ({
  name: f.name.trim(),
  emoji: f.emoji,
  category: f.category,
  servings: f.servings || undefined,
  ingredients: ingredientLines(f.ingredients),
  instructions: f.instructions.trim(),
  sourceUrl: f.url.trim() || undefined,
});

/**
 * The fields of `draft` that differ from what the editor opened with
 * (`opened`, read through the editor's fields), so a field left alone is
 * not written and another device's change to it meanwhile is kept.
 * Ingredients compare line by line.
 */
export function recipeChanges(opened: Recipe, draft: RecipeDraft): Partial<RecipeDraft> {
  const was = recipeDraft(recipeFields(opened));
  const same = (k: keyof RecipeDraft) =>
    k === 'ingredients' ? was.ingredients.join('\n') === draft.ingredients.join('\n') : was[k] === draft[k];
  return Object.fromEntries(Object.entries(draft).filter(([k]) => !same(k as keyof RecipeDraft))) as Partial<RecipeDraft>;
}

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

/** "example.com/recipes/biryani" for showing a source without the scheme, the path readable ("كبسة", not "%D9%83..."). */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // A malformed escape: show the path as stored.
    }
    return (u.host + path).replace(/\/$/, '');
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
