import { computed, signal } from '@preact/signals';
import { goTo } from '../../app/nav';
import { batch, data, fieldChanges, newId, put } from '../../data/store';
import type { MealCategoryId, Recipe } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { recipeChanges, type RecipeDraft } from './text';

/** Recipes tab state and recipe writes. Callers wrap writes in asParent(). */

export const selectedRecipeId = signal<string | null>(null);
export const recipeFilter = signal<MealCategoryId | null>(null);
export const recipeSearch = signal('');
/** The recipe editor sheet: new (no recipe) or edit. */
export const recipeEditor = signal<{ recipe?: Recipe } | null>(null);

export const recipes = computed(() => [...data.recipes.value].sort((a, b) => a.name.localeCompare(b.name)));

/** Select a recipe and clear the filter and search, so it is in the list. */
export function showRecipe(id: string): void {
  selectedRecipeId.value = id;
  recipeFilter.value = null;
  recipeSearch.value = '';
}

/** Show a recipe full size on the Recipes tab (from a planned meal's "Open recipe"). */
export function openRecipe(id: string): void {
  showRecipe(id);
  goTo('recipes');
}

/** Add a recipe. */
export function createRecipe(draft: RecipeDraft): Recipe {
  const recipe: Recipe = { ...draft, id: newId(), createdAt: currentTime() };
  void put('recipes', recipe);
  return recipe;
}

/**
 * Save the recipe editor over `opened`, the recipe as the editor opened it:
 * only the fields changed in it (recipeChanges), so another parent's edit
 * to the others meanwhile is kept, and nothing when the recipe was deleted
 * meanwhile (false). A rename carries over to the planned meals made from
 * it that still show its old name (a meal retitled by hand keeps its
 * title).
 */
export function updateRecipe(opened: Recipe, draft: RecipeDraft): boolean {
  const live = data.recipes.value.find((r) => r.id === opened.id);
  if (!live) return false;
  const changes = recipeChanges(opened, draft);
  if (!Object.keys(changes).length) return true;
  const b = batch().patch('recipes', live.id, fieldChanges(changes) as Partial<Recipe>);
  const name = changes.name;
  if (name !== undefined && name !== live.name)
    for (const m of data.meals.value)
      if (m.recipeId === live.id && m.title === live.name) b.patch('meals', m.id, { title: name });
  void b.commit();
  return true;
}

/** Delete a recipe; with `withMeals`, also every planned meal made from it (otherwise they stay, unlinked in effect). */
export function deleteRecipe(recipe: Recipe, withMeals: boolean): void {
  const b = batch().remove('recipes', recipe.id);
  if (withMeals) for (const m of data.meals.value) if (m.recipeId === recipe.id) b.remove('meals', m.id);
  void b.commit();
  if (selectedRecipeId.value === recipe.id) selectedRecipeId.value = null;
}
