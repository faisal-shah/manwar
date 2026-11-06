import { useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { Plus } from 'lucide-preact';
import { asParent } from '../../core/lock';
import { data } from '../../data/store';
import type { MealCategoryId, Recipe } from '../../data/types';
import { Button, Field, Stepper } from '../../ui/controls';
import { Sheet, useCloseWhenGone } from '../../ui/overlays';
import { EmojiPicker, RECIPE_EMOJI } from '../../ui/pickers';
import { categories } from '../meals/state';
import { CategoryPicker } from '../meals/ui';
import { askDeleteRecipe } from './RecipeView';
import { createRecipe, showRecipe, updateRecipe } from './state';
import { recipeDraft, recipeFields, sourceUrlError } from './text';

/** Add or edit a recipe: name, emoji, category, servings, ingredients (one per line), instructions, source URL. */
export function RecipeEditor({ recipe, onClose }: { recipe?: Recipe; onClose: () => void }) {
  const [opened] = useState(() => recipeFields(recipe));
  const [name, setName] = useState(opened.name);
  const [emoji, setEmoji] = useState(opened.emoji);
  const [category, setCategory] = useState<MealCategoryId>(opened.category);
  const [servings, setServings] = useState(opened.servings);
  const [ingredients, setIngredients] = useState(opened.ingredients);
  const [instructions, setInstructions] = useState(opened.instructions);
  const [url, setUrl] = useState(opened.url);
  const [pickEmoji, setPickEmoji] = useState(false);
  const urlError = sourceUrlError(url);
  const valid = !!name.trim() && !urlError;

  useCloseWhenGone(
    !!recipe && !data.recipes.value.some((r) => r.id === recipe.id),
    onClose,
    `${recipe?.name} was deleted on another device.`,
  );

  const save = () =>
    void asParent(() => {
      const draft = recipeDraft({ name, emoji, category, servings, ingredients, instructions, url });
      // Only what was changed here is written (recipeChanges against the recipe as it opened).
      if (recipe) updateRecipe(recipe, draft);
      else showRecipe(createRecipe(draft).id);
      onClose();
    });

  return (
    <Sheet
      title={recipe ? 'Edit recipe' : 'New recipe'}
      wide
      onClose={onClose}
      footer={
        <>
          {recipe && (
            <Button variant="danger" onClick={async () => (await askDeleteRecipe(recipe)) && onClose()}>
              Delete
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {recipe ? 'Save' : 'Add recipe'}
          </Button>
        </>
      }
    >
      <div class="recipe-editor">
        <Field label="Name">
          <div class="row">
            <button
              type="button"
              class="emoji-btn"
              aria-label={emoji ? `Emoji ${emoji}, change` : 'Choose an emoji'}
              onClick={() => setPickEmoji(!pickEmoji)}
            >
              {emoji ?? <Plus size="2.4rem" />}
            </button>
            <input
              class="input grow"
              value={name}
              placeholder="Chicken biryani"
              onInput={(e: TargetedEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
            />
          </div>
        </Field>
        {pickEmoji && (
          <div class="field">
            <EmojiPicker
              groups={RECIPE_EMOJI}
              value={emoji}
              onChange={(e) => {
                setEmoji(e);
                if (e) setPickEmoji(false);
              }}
            />
          </div>
        )}
        <div class="row re-meta">
          <Field label="Category">
            <CategoryPicker categories={categories.value} value={category} onChange={(c) => c && setCategory(c)} />
          </Field>
          <Field label="Servings">
            <div class="row">
              <Stepper value={servings} min={0} max={30} onChange={setServings} />
              <span class="muted">{servings ? '' : 'Not set'}</span>
            </div>
          </Field>
        </div>
        <div class="re-cols">
          <Field label="Ingredients, one per line">
            <textarea
              class="input"
              rows={10}
              value={ingredients}
              placeholder={'2 lb chicken thighs\n3 cups basmati rice\n2 onions'}
              onInput={(e: TargetedEvent<HTMLTextAreaElement>) => setIngredients(e.currentTarget.value)}
            />
          </Field>
          <Field label="Instructions">
            <textarea
              class="input"
              rows={10}
              value={instructions}
              placeholder={'One step per line, or a paragraph'}
              onInput={(e: TargetedEvent<HTMLTextAreaElement>) => setInstructions(e.currentTarget.value)}
            />
          </Field>
        </div>
        <Field label="Source (optional)">
          <input
            class="input"
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://"
            onInput={(e: TargetedEvent<HTMLInputElement>) => setUrl(e.currentTarget.value)}
          />
          {urlError && <span class="re-error">{urlError}</span>}
        </Field>
      </div>
    </Sheet>
  );
}
