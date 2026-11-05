import { AlignLeft, BookOpen, CalendarDays, Pencil, Repeat as RepeatIcon, ShoppingCart, Trash2 } from 'lucide-preact';
import { asParent } from '../../core/lock';
import type { ISODate, MealEntry } from '../../data/types';
import { formatLongDate } from '../../lib/date';
import { describeRepeat } from '../../lib/repeat';
import { IconButton } from '../../ui/controls';
import { Popover, choose, toast } from '../../ui/overlays';
import { openRecipe } from '../recipes/state';
import { ingredientRows } from '../recipes/text';
import { openIngredients } from './IngredientsModal';
import { SCOPES } from './PlanMealSheet';
import { categoryById, changeOccurrence, mealEmoji, planTarget, recipeOf } from './state';
import { CategoryBadge } from './ui';

/** Tap a planned meal: title, edit and remove, Add ingredients, Open recipe, date, category, repeat, notes. */
export function MealPopover({
  entry,
  date,
  anchor,
  onClose,
}: {
  entry: MealEntry;
  date: ISODate;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const recipe = recipeOf(entry);
  const cat = categoryById.value.get(entry.category);
  const emoji = mealEmoji(entry);

  const edit = () =>
    void asParent(() => {
      onClose();
      planTarget.value = { date, category: entry.category, entry };
    });
  const remove = () =>
    void asParent(async () => {
      const scope = entry.repeat ? await choose(`Remove ${entry.title}`, SCOPES) : 'all';
      if (!scope) return;
      const undo = changeOccurrence(entry, date, scope, null);
      onClose();
      toast(`Removed ${entry.title}.`, { label: 'Undo', run: () => void asParent(undo) });
    });

  return (
    <Popover anchor={anchor} width={50} onClose={onClose}>
      <div class="meal-pop" style={cat ? { '--c': cat.color } : undefined}>
        <header class="mp-head">
          {emoji && <span class="mp-emoji">{emoji}</span>}
          <h2 class="mp-title">{entry.title}</h2>
          <IconButton label="Edit meal" class="mp-btn" onClick={edit}>
            <Pencil size="2.2rem" />
          </IconButton>
          <IconButton label="Remove meal" class="mp-btn danger" onClick={remove}>
            <Trash2 size="2.2rem" />
          </IconButton>
        </header>
        {recipe && (
          <div class="mp-actions">
            {recipe.ingredients.length > 0 && (
              <button
                type="button"
                class="pill-btn"
                onClick={() => {
                  onClose();
                  openIngredients(recipe);
                }}
              >
                <ShoppingCart size="2.2rem" /> Add ingredients
              </button>
            )}
            <button
              type="button"
              class="pill-btn"
              onClick={() => {
                onClose();
                openRecipe(recipe.id);
              }}
            >
              <BookOpen size="2.2rem" /> Open recipe
            </button>
          </div>
        )}
        <ul class="mp-rows">
          <li>
            <CalendarDays size="2.4rem" />
            <span>{formatLongDate(date)}</span>
          </li>
          {cat && (
            <li>
              <CategoryBadge category={cat} size={2.8} />
              <span>{cat.name}</span>
            </li>
          )}
          {entry.repeat && (
            <li>
              <RepeatIcon size="2.4rem" />
              <span>{describeRepeat(entry.repeat, entry.date)}</span>
            </li>
          )}
          {entry.notes && (
            <li>
              <AlignLeft size="2.4rem" />
              <span class="mp-notes">{entry.notes}</span>
            </li>
          )}
          {!entry.notes && recipe && recipe.ingredients.length > 0 && (
            <li>
              <AlignLeft size="2.4rem" />
              <span class="mp-notes">
                {ingredientRows(recipe.ingredients)
                  .map((r) => r.text)
                  .join('\n')}
              </span>
            </li>
          )}
        </ul>
      </div>
    </Popover>
  );
}
