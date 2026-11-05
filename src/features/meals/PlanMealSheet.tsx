import { useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { CalendarDays, ChevronDown, ChevronUp, Search, X } from 'lucide-preact';
import { asParent } from '../../core/lock';
import type { ISODate, MealCategoryId, MealEntry, Recipe, Repeat } from '../../data/types';
import { today } from '../../lib/clock';
import { formatLongDate } from '../../lib/date';
import { Button, Field, Segmented, SettingRow, Toggle } from '../../ui/controls';
import { Sheet, choose, toast, useCloseWhenGone } from '../../ui/overlays';
import { createRecipe, recipes } from '../recipes/state';
import { ingredientLines, searchRecipes } from '../recipes/text';
import { openIngredients } from './IngredientsModal';
import type { Scope } from './plan';
import { categoryById, changeOccurrence, liveMeal, planMeal, visibleCategories } from './state';
import { CategoryBadge, CategoryPicker, DayPicker, RepeatRow } from './ui';

export const SCOPES: { value: Scope; label: string }[] = [
  { value: 'one', label: 'Just this day' },
  { value: 'following', label: 'This and following days' },
  { value: 'all', label: 'Every time' },
];

/** "Dinner planned for Thursday, Nov 5." with a shortcut to add the recipe's ingredients. */
export function plannedToast(entry: MealEntry, recipe?: Recipe): void {
  const cat = categoryById.value.get(entry.category)?.name ?? 'Meal';
  toast(
    `${cat} planned for ${formatLongDate(entry.date)}.`,
    recipe?.ingredients.length ? { label: 'Add ingredients', run: () => openIngredients(recipe) } : undefined,
    7000,
  );
}

/**
 * Plan a meal into a cell (From recipes: tap one to plan it; New entry: a
 * one-off title and notes, optionally saved as a recipe), or edit a planned
 * one. Date, category and repeat apply to both tabs.
 */
export function PlanMealSheet({
  date,
  category,
  entry,
  onClose,
}: {
  date: ISODate;
  category: MealCategoryId;
  entry?: MealEntry;
  onClose: () => void;
}) {
  const editing = !!entry;
  // With no recipes yet, a typed entry is the only way to plan; start there.
  const [tab, setTab] = useState<'recipes' | 'entry'>(entry || !recipes.value.length ? 'entry' : 'recipes');
  const [day, setDay] = useState(date);
  const [cat, setCat] = useState(category);
  const [repeat, setRepeat] = useState<Repeat | undefined>(entry?.repeat);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [recipeId, setRecipeId] = useState(entry?.recipeId);
  const [asRecipe, setAsRecipe] = useState(false);
  const [ingredients, setIngredients] = useState('');
  const [pickDay, setPickDay] = useState(false);
  const linked = recipeId ? recipes.value.find((r) => r.id === recipeId) : undefined;
  useCloseWhenGone(!!entry && !liveMeal(entry.id), onClose, `${entry?.title} was removed on another device.`);

  const found = searchRecipes(recipes.value, query);
  const inCat = query.trim() ? found : found.filter((r) => r.category === cat);
  const others = query.trim() ? [] : found.filter((r) => r.category !== cat);

  const pick = (r: Recipe) => {
    if (editing) {
      setRecipeId(r.id);
      setTitle(r.name);
      setTab('entry');
      return;
    }
    void asParent(() => {
      const e = planMeal({ date: day, category: cat, title: r.name, recipeId: r.id, repeat });
      onClose();
      plannedToast(e, r);
    });
  };

  const planNew = () =>
    void asParent(() => {
      const name = title.trim();
      const recipe = asRecipe
        ? createRecipe({ name, category: cat, ingredients: ingredientLines(ingredients), instructions: notes.trim() })
        : undefined;
      const e = planMeal({
        date: day,
        category: cat,
        title: name,
        recipeId: recipe?.id,
        notes: recipe ? undefined : notes,
        repeat,
      });
      onClose();
      plannedToast(e, recipe);
    });

  const save = () =>
    void asParent(async () => {
      const changes: Partial<MealEntry> = { title: title.trim(), notes: notes.trim() || undefined, recipeId, category: cat };
      if (day !== date) changes.date = day;
      if (JSON.stringify(repeat) !== JSON.stringify(entry!.repeat)) changes.repeat = repeat;
      const scope = entry!.repeat ? await choose('Change a repeating meal', SCOPES) : 'all';
      if (!scope) return;
      changeOccurrence(entry!, date, scope, changes);
      onClose();
    });

  const recipeRow = (r: Recipe) => {
    const rc = categoryById.value.get(r.category);
    return (
      <button type="button" class={`pick-row${r.id === recipeId ? ' on' : ''}`} key={r.id} onClick={() => pick(r)}>
        <span class="pick-emoji">{r.emoji ?? (rc && <CategoryBadge category={rc} size={3.2} />)}</span>
        <bdi class="grow">{r.name}</bdi>
        {rc && <CategoryBadge category={rc} size={2.8} />}
      </button>
    );
  };

  const footer =
    tab === 'recipes' ? undefined : editing ? (
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!title.trim()} onClick={save}>
          Save
        </Button>
      </>
    ) : (
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!title.trim()} onClick={planNew}>
          Plan meal
        </Button>
      </>
    );

  return (
    <Sheet title={editing ? 'Edit meal' : 'Plan meal'} onClose={onClose} footer={footer}>
      <div class="plan-sheet">
        <Segmented<'recipes' | 'entry'>
          value={tab}
          options={[
            { value: 'recipes', label: 'From recipes' },
            { value: 'entry', label: editing ? 'Details' : 'New entry' },
          ]}
          onChange={setTab}
        />
        <div class="slot">
          <button type="button" class="slot-day" aria-expanded={pickDay} onClick={() => setPickDay(!pickDay)}>
            <CalendarDays size="2.4rem" />
            <span class="grow">{formatLongDate(day)}</span>
            {pickDay ? <ChevronUp size="2.4rem" /> : <ChevronDown size="2.4rem" />}
          </button>
          {pickDay && (
            <DayPicker
              value={day}
              from={day < today.value ? day : today.value}
              onChange={(d) => {
                setDay(d);
                setPickDay(false);
              }}
            />
          )}
          <CategoryPicker categories={visibleCategories.value} value={cat} onChange={(c) => c && setCat(c)} />
          <RepeatRow value={repeat} start={day} onChange={setRepeat} />
        </div>

        {tab === 'recipes' ? (
          <div class="pick">
            <label class="search">
              <Search size="2.2rem" />
              <input
                placeholder="Search recipes"
                aria-label="Search recipes"
                value={query}
                onInput={(e: TargetedEvent<HTMLInputElement>) => setQuery(e.currentTarget.value)}
              />
              {query && (
                <button type="button" class="lc-icon" aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size="2.2rem" />
                </button>
              )}
            </label>
            {inCat.map(recipeRow)}
            {!inCat.length && (
              <p class="muted pick-empty">
                {!recipes.value.length
                  ? 'No recipes yet. Plan a new entry, and turn on Save to recipes to keep it.'
                  : query.trim()
                    ? 'No recipe matches.'
                    : `No ${categoryById.value.get(cat)?.name.toLowerCase()} recipes yet.`}
              </p>
            )}
            {others.length > 0 && <h4 class="pick-head">Other recipes</h4>}
            {others.map(recipeRow)}
          </div>
        ) : (
          <div class="entry-form">
            {editing && (
              <SettingRow label="Recipe" hint={linked ? `${linked.emoji ?? ''} ${linked.name}`.trim() : 'Not from a recipe'}>
                {linked ? (
                  <Button small onClick={() => setRecipeId(undefined)}>
                    Unlink
                  </Button>
                ) : null}
                <Button small onClick={() => setTab('recipes')}>
                  {linked ? 'Change' : 'Choose'}
                </Button>
              </SettingRow>
            )}
            <Field label="What are we eating?">
              <input
                class="input"
                value={title}
                placeholder="Tacos"
                onInput={(e: TargetedEvent<HTMLInputElement>) => setTitle(e.currentTarget.value)}
              />
            </Field>
            <Field label={asRecipe ? 'Instructions' : 'Notes'}>
              <textarea
                class="input"
                rows={3}
                value={notes}
                placeholder={asRecipe ? 'How to make it' : 'Instructions or ingredients'}
                onInput={(e: TargetedEvent<HTMLTextAreaElement>) => setNotes(e.currentTarget.value)}
              />
            </Field>
            {!editing && (
              <>
                <SettingRow label="Save to recipes" hint="Keep it in Recipes to plan again later.">
                  <Toggle label="Save to recipes" on={asRecipe} onChange={setAsRecipe} />
                </SettingRow>
                {asRecipe && (
                  <Field label="Ingredients, one per line">
                    <textarea
                      class="input"
                      rows={4}
                      value={ingredients}
                      placeholder={'1 lb ground beef\n8 taco shells'}
                      onInput={(e: TargetedEvent<HTMLTextAreaElement>) => setIngredients(e.currentTarget.value)}
                    />
                  </Field>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
