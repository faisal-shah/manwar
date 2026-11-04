import { useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { ChevronDown, ChevronUp, Repeat as RepeatIcon } from 'lucide-preact';
import type { ISODate, MealCategory, MealCategoryId, Repeat } from '../../data/types';
import { addDays, dayShort, fromISODate } from '../../lib/date';
import { describeRepeat } from '../../lib/repeat';
import { RepeatEditor } from '../../ui/pickers';

/** Letter disc in the category color (B, L, D, S). */
export function CategoryBadge({ category, size = 3 }: { category: Pick<MealCategory, 'name' | 'color'>; size?: number }) {
  return (
    <span
      class="cat-badge"
      style={{ '--c': category.color, width: `${size}rem`, height: `${size}rem`, fontSize: `${size * 0.46}rem` }}
      aria-hidden="true"
    >
      {category.name.trim().charAt(0).toUpperCase()}
    </span>
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

/** The next seven days as chips (Today, Tomorrow, Fri 6, ...) plus a date field for anything else. */
export function DayPicker({ value, from, onChange }: { value: ISODate; from: ISODate; onChange: (d: ISODate) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const label = (d: ISODate, i: number) =>
    i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${dayShort(fromISODate(d).getDay())} ${fromISODate(d).getDate()}`;
  return (
    <div class="day-picker">
      <div class="chips">
        {days.map((d, i) => (
          <button type="button" class={`chip${d === value ? ' on' : ''}`} aria-pressed={d === value} onClick={() => onChange(d)}>
            {label(d, i)}
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
