import { useState } from 'preact/hooks';
import { Link, Pencil, ShoppingCart, Trash2, Users, Utensils } from 'lucide-preact';
import { asParent } from '../../core/lock';
import { data } from '../../data/store';
import type { ISODate, MealCategoryId, Recipe, Repeat } from '../../data/types';
import { today } from '../../lib/clock';
import { Button, IconButton } from '../../ui/controls';
import { Modal, choose, confirm, toast } from '../../ui/overlays';
import { openIngredients } from '../meals/IngredientsModal';
import { plannedToast } from '../meals/PlanMealSheet';
import { categoryById, planMeal, visibleCategories } from '../meals/state';
import { CategoryBadge, CategoryPicker, DayPicker, RepeatRow } from '../meals/ui';
import { deleteRecipe, recipeEditor } from './state';
import { displayUrl, ingredientRows, instructionSteps } from './text';
import { plural } from '../../lib/text';

/** "This recipe" or "This recipe and planned meals", as on Skylight. Resolves true when deleted. */
export async function askDeleteRecipe(recipe: Recipe): Promise<boolean> {
  let deleted = false;
  await asParent(async () => {
    const planned = data.meals.value.filter((m) => m.recipeId === recipe.id).length;
    const how = planned
      ? await choose(`Delete ${recipe.name}?`, [
          { value: 'recipe', label: 'Delete the recipe, keep planned meals' },
          { value: 'all', label: `Delete the recipe and ${plural(planned, 'planned meal')}` },
        ])
      : (await confirm(`Delete ${recipe.name}?`, { body: 'This cannot be undone.', ok: 'Delete', danger: true })) && 'recipe';
    if (!how) return;
    deleteRecipe(recipe, how === 'all');
    deleted = true;
    toast(`Deleted ${recipe.name}.`);
  });
  return deleted;
}

/** The selected recipe, large enough to cook from across the kitchen. */
export function RecipeView({ recipe }: { recipe: Recipe }) {
  const cat = categoryById.value.get(recipe.category);
  const steps = instructionSteps(recipe.instructions);
  const ingredients = ingredientRows(recipe.ingredients);
  const [planning, setPlanning] = useState(false);
  return (
    <article class="recipe-card scroll" style={cat ? { '--c': cat.color } : undefined} aria-label={recipe.name}>
      <header class="rc-head">
        {recipe.emoji && <span class="rc-emoji">{recipe.emoji}</span>}
        <h2 class="rc-title">
          <bdi>{recipe.name}</bdi>
        </h2>
        <IconButton label="Edit recipe" class="rc-btn" onClick={() => void asParent(() => (recipeEditor.value = { recipe }))}>
          <Pencil size="2.4rem" />
        </IconButton>
        <IconButton label="Delete recipe" class="rc-btn danger" onClick={() => void askDeleteRecipe(recipe)}>
          <Trash2 size="2.4rem" />
        </IconButton>
      </header>
      <div class="rc-actions">
        {recipe.ingredients.length > 0 && (
          <button type="button" class="pill-btn" onClick={() => openIngredients(recipe)}>
            <ShoppingCart size="2.2rem" /> Add to grocery list
          </button>
        )}
        <button
          type="button"
          class="pill-btn"
          onClick={() => void asParent(() => setPlanning(true), 'Enter the PIN to plan meals.')}
        >
          <Utensils size="2.2rem" /> Add to meal plan
        </button>
      </div>
      <div class="rc-meta">
        {cat && (
          <span>
            <CategoryBadge category={cat} size={3} /> {cat.name}
          </span>
        )}
        {recipe.servings ? (
          <span>
            <Users size="2.4rem" /> Serves {recipe.servings}
          </span>
        ) : null}
        {recipe.sourceUrl && (
          <span class="rc-source">
            <Link size="2.2rem" /> <span>{displayUrl(recipe.sourceUrl)}</span>
          </span>
        )}
      </div>
      <div class={`rc-cols${ingredients.length && steps.length ? '' : ' single'}`}>
        {ingredients.length > 0 && (
          <section>
            <h3>Ingredients</h3>
            <ul class="rc-ingredients">
              {ingredients.map((r) => (
                <li class={r.heading ? 'rc-ing-head' : undefined}>
                  <bdi>{r.text}</bdi>
                </li>
              ))}
            </ul>
          </section>
        )}
        {steps.length > 0 && (
          <section>
            <h3>Instructions</h3>
            <ol class="rc-steps">
              {steps.map((s, i) => (
                <li>
                  <span class="rc-n">{i + 1}</span>
                  <bdi>{s}</bdi>
                </li>
              ))}
            </ol>
          </section>
        )}
        {!ingredients.length && !steps.length && (
          <p class="muted">No ingredients or instructions yet. Tap the pencil to add them.</p>
        )}
      </div>
      {planning && <PlanRecipeModal recipe={recipe} onClose={() => setPlanning(false)} />}
    </article>
  );
}

/** Pick a day and category (and repeat) for a recipe. */
function PlanRecipeModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const cats = visibleCategories.value;
  const [date, setDate] = useState<ISODate>(today.value);
  const [category, setCategory] = useState<MealCategoryId>(
    cats.some((c) => c.id === recipe.category) ? recipe.category : cats[0].id,
  );
  const [repeat, setRepeat] = useState<Repeat | undefined>();
  const plan = () =>
    void asParent(() => {
      const e = planMeal({ date, category, title: recipe.name, recipeId: recipe.id, repeat });
      onClose();
      plannedToast(e, recipe);
    });
  return (
    <Modal
      title={`Plan ${recipe.name}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={plan}>
            Plan meal
          </Button>
        </>
      }
    >
      <div class="plan-recipe">
        <div class="field">
          <span class="field-label">Day</span>
          <DayPicker value={date} from={today.value} onChange={setDate} />
        </div>
        <div class="field">
          <span class="field-label">Meal</span>
          <CategoryPicker categories={cats} value={category} onChange={(c) => c && setCategory(c)} />
        </div>
        <RepeatRow value={repeat} start={date} onChange={setRepeat} />
      </div>
    </Modal>
  );
}
