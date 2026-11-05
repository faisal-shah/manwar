import { useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { ChevronDown, ChevronUp, Repeat as RepeatIcon } from 'lucide-preact';
import type { ISODate, MealCategory, MealCategoryId, Recipe, Repeat } from '../../data/types';
import { today } from '../../lib/clock';
import { addDays, dayShort, fromISODate } from '../../lib/date';
import { describeRepeat } from '../../lib/repeat';
import { RepeatEditor } from '../../ui/pickers';

/** First character of a name as one grapheme ("🍳 Brunch" gives the whole emoji, not half of it). */
export const initialOf = (name: string): string =>
  ([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name.trim())][0]?.segment ?? '').toUpperCase();

/** Letter disc in the category color (B, L, D, S). */
export function CategoryBadge({ category, size = 3 }: { category: Pick<MealCategory, 'name' | 'color'>; size?: number }) {
  return (
    <span
      class="cat-badge"
      style={{ '--c': category.color, width: `${size}rem`, height: `${size}rem`, fontSize: `${size * 0.46}rem` }}
      aria-hidden="true"
    >
      {initialOf(category.name)}
    </span>
  );
}

/**
 * A recipe row's lead, name and category (Recipes list, Plan meal): the
 * emoji leads, or without one the category letter, as on Skylight's rows;
 * the letter trails only after an emoji, so it is never shown twice.
 */
export function RecipeRowContent({
  recipe,
  category,
  leadClass,
}: {
  recipe: Pick<Recipe, 'emoji' | 'name'>;
  category: MealCategory | undefined;
  leadClass: string;
}) {
  return (
    <>
      <span class={leadClass}>{recipe.emoji ?? (category && <CategoryBadge category={category} size={3.2} />)}</span>
      <bdi class="grow">{recipe.name}</bdi>
      {recipe.emoji && category && <CategoryBadge category={category} size={2.8} />}
    </>
  );
}

/**
 * Category circles with labels, as on Skylight's Plan Meal panel and recipe
 * filter. With `clearable`, tapping the selected one clears it (filter).
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  clearable,
}: {
  categories: MealCategory[];
  value: MealCategoryId | null;
  onChange: (v: MealCategoryId | null) => void;
  clearable?: boolean;
}) {
  return (
    <div class="cat-picker" role="radiogroup">
      {categories.map((c) => {
        const on = c.id === value;
        return (
          <button
            type="button"
            role="radio"
            aria-checked={on}
            class={`${on ? 'on' : ''}${value && !on ? ' faded' : ''}`}
            style={{ '--c': c.color }}
            onClick={() => onChange(on && clearable ? null : c.id)}
          >
            <CategoryBadge category={c} size={5} />
            <span>{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Seven days from `from` as chips (Today, Tomorrow, Fri 6, ...) plus a date field for anything else. */
export function DayPicker({ value, from, onChange }: { value: ISODate; from: ISODate; onChange: (d: ISODate) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  // `from` may be a past day (planning last Monday), so the names go by the real date.
  const label = (d: ISODate) =>
    d === today.value
      ? 'Today'
      : d === addDays(today.value, 1)
        ? 'Tomorrow'
        : `${dayShort(fromISODate(d).getDay())} ${fromISODate(d).getDate()}`;
  return (
    <div class="day-picker">
      <div class="chips">
        {days.map((d) => (
          <button type="button" class={`chip${d === value ? ' on' : ''}`} aria-pressed={d === value} onClick={() => onChange(d)}>
            {label(d)}
          </button>
        ))}
      </div>
      <input
        class={`input date-input${days.includes(value) ? '' : ' on'}`}
        type="date"
        aria-label="Another date"
        value={value}
        onInput={(e: TargetedEvent<HTMLInputElement>) => e.currentTarget.value && onChange(e.currentTarget.value)}
      />
    </div>
  );
}

/** "Repeats: Does not repeat" row that opens the shared RepeatEditor. */
export function RepeatRow({
  value,
  start,
  onChange,
}: {
  value: Repeat | undefined;
  start: ISODate;
  onChange: (r: Repeat | undefined) => void;
}) {
  const [open, setOpen] = useState(!!value);
  return (
    <div class="repeat-row">
      <button type="button" class="repeat-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <RepeatIcon size="2.4rem" />
        <span class="grow">Repeats</span>
        <span class="muted">{describeRepeat(value, start)}</span>
        {open ? <ChevronUp size="2.4rem" /> : <ChevronDown size="2.4rem" />}
      </button>
      {open && (
        <div class="repeat-body">
          <RepeatEditor value={value} start={start} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
