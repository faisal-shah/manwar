import './meals.css';
import { useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { Pencil } from 'lucide-preact';
import { asParent } from '../../core/lock';
import { DEFAULT_MEAL_CATEGORIES } from '../../data/settings';
import { saveSettings, settings } from '../../data/store';
import type { MealCategory, MealCategoryId } from '../../data/types';
import { IconButton, Toggle } from '../../ui/controls';
import { toast } from '../../ui/overlays';
import { ColorSwatches, PROFILE_COLORS } from '../../ui/pickers';
import { CategoryBadge } from './ui';

const MEAL_COLORS = [...new Set([...DEFAULT_MEAL_CATEGORIES.map((c) => c.color), ...PROFILE_COLORS])];

/**
 * The four meal categories: rename, recolor, show on the Meals tab, show on
 * the calendar. Writes settings.mealCategories. Mounted in the Settings
 * sheet and in the Meals tab's Filter popover.
 */
export function MealCategoriesEditor() {
  const cats = settings.value.mealCategories;
  const [editing, setEditing] = useState<MealCategoryId | null>(null);
  const set = (id: MealCategoryId, patch: Partial<MealCategory>) =>
    void asParent(() => void saveSettings({ mealCategories: cats.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setVisible = (c: MealCategory, visible: boolean) => {
    if (!visible && cats.filter((x) => x.visible).length === 1) {
      toast('Keep at least one meal category showing.');
      return;
    }
    set(c.id, { visible });
  };
  return (
    <div class="meal-cats">
      <div class="mc-row mc-labels" aria-hidden="true">
        <span class="grow" />
        <span class="mc-tg">Meals</span>
        <span class="mc-tg">Calendar</span>
        <span class="mc-pencil-gap" />
      </div>
      {cats.map((c) => (
        <div key={c.id} class="mc-block">
          <div class="mc-row">
            <CategoryBadge category={c} size={3.6} />
            <span class="mc-name grow">{c.name}</span>
            <span class="mc-tg">
              <Toggle label={`Show ${c.name} on the Meals tab`} on={c.visible} onChange={(v) => setVisible(c, v)} />
            </span>
            <span class="mc-tg">
              <Toggle
                label={`Show ${c.name} on the calendar`}
                on={c.showOnCalendar}
                onChange={(v) => set(c.id, { showOnCalendar: v })}
              />
            </span>
            <IconButton
              label={`Edit ${c.name}`}
              class="mc-pencil"
              onClick={() => void asParent(() => setEditing(editing === c.id ? null : c.id))}
            >
              <Pencil size="2.2rem" />
            </IconButton>
          </div>
          {editing === c.id && (
            <CategoryEdit category={c} onRename={(name) => set(c.id, { name })} onColor={(color) => set(c.id, { color })} />
          )}
        </div>
      ))}
    </div>
  );
}

function CategoryEdit({
  category,
  onRename,
  onColor,
}: {
  category: MealCategory;
  onRename: (n: string) => void;
  onColor: (c: string) => void;
}) {
  const [name, setName] = useState(category.name);
  const commit = () => {
    const n = name.trim();
    if (!n) setName(category.name);
    else if (n !== category.name) onRename(n);
  };
  return (
    <div class="mc-edit">
      <input
        class="input"
        aria-label={`Rename ${category.name}`}
        value={name}
        maxLength={24}
        onInput={(e: TargetedEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <ColorSwatches value={category.color} colors={MEAL_COLORS} onChange={onColor} />
    </div>
  );
}
