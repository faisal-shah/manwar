import '../meals/meals.css';
import './recipes.css';
import type { TargetedEvent } from 'preact';
import { BookOpen, Search, X } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { asParent } from '../../core/lock';
import type { Recipe } from '../../data/types';
import { Empty } from '../../ui/controls';
import { categories, categoryById } from '../meals/state';
import { CategoryPicker, RecipeRowContent } from '../meals/ui';
import { RecipeEditor } from './RecipeEditor';
import { RecipeView } from './RecipeView';
import { recipeEditor, recipeFilter, recipeSearch, recipes, selectedRecipeId } from './state';
import { searchRecipes } from './text';

/** Master-detail: searchable recipe list (grouped by meal category, or filtered to one) beside the selected recipe. */
function RecipesBody() {
  const query = recipeSearch.value;
  const filter = recipeFilter.value;
  const found = searchRecipes(recipes.value, query).filter((r) => !filter || r.category === filter);
  const grouped = !query.trim() && !filter;
  const selected = found.find((r) => r.id === selectedRecipeId.value) ?? found[0];
  const ed = recipeEditor.value;

  const row = (r: Recipe) => {
    const cat = categoryById.value.get(r.category);
    return (
      <button
        type="button"
        key={r.id}
        class={`rl-row${r.id === selected?.id ? ' on' : ''}`}
        aria-current={r.id === selected?.id ? 'true' : undefined}
        onClick={() => (selectedRecipeId.value = r.id)}
      >
        <RecipeRowContent recipe={r} category={cat} leadClass="rl-emoji" />
      </button>
    );
  };

  return (
    <div class="recipes">
      <aside class="recipe-list">
        <CategoryPicker categories={categories.value} value={filter} clearable onChange={(c) => (recipeFilter.value = c)} />
        <label class="search">
          <Search size="2.2rem" />
          <input
            placeholder="Search recipes"
            aria-label="Search recipes"
            value={query}
            onInput={(e: TargetedEvent<HTMLInputElement>) => (recipeSearch.value = e.currentTarget.value)}
          />
          {query && (
            <button type="button" class="lc-icon" aria-label="Clear search" onClick={() => (recipeSearch.value = '')}>
              <X size="2.2rem" />
            </button>
          )}
        </label>
        <div class="rl-items scroll">
          {grouped
            ? categories.value.map((c) => {
                const rs = found.filter((r) => r.category === c.id);
                return rs.length ? (
                  <div class="rl-group" key={c.id}>
                    <h3 class="rl-head">{c.name}</h3>
                    {rs.map(row)}
                  </div>
                ) : null;
              })
            : found.map(row)}
          {!found.length && (
            <p class="muted rl-empty">{recipes.value.length ? 'No recipe matches.' : 'No recipes yet. Tap + to add one.'}</p>
          )}
        </div>
      </aside>
      {selected ? (
        <RecipeView key={selected.id} recipe={selected} />
      ) : (
        <div class="recipe-card">
          <Empty emoji="📖">Pick a recipe, or tap + to add one.</Empty>
        </div>
      )}
      {ed && <RecipeEditor recipe={ed.recipe} onClose={() => (recipeEditor.value = null)} />}
    </div>
  );
}

export const recipesTab: TabDef = {
  id: 'recipes',
  label: 'Recipes',
  icon: BookOpen,
  Body: RecipesBody,
  onAdd: () => void asParent(() => (recipeEditor.value = {}), 'Enter the PIN to add a recipe.'),
};
