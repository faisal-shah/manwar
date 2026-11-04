import { computed, signal } from '@preact/signals';
import { batch, data, newId, put, settings } from '../../data/store';
import type { ISODate, MealCategory, MealCategoryId, MealEntry, Recipe, Repeat } from '../../data/types';
import { currentTime, today } from '../../lib/clock';
import { editOccurrence, mealOccurrences, nextCellOrder, weekOf, type MealOp, type Scope } from './plan';

/** Reactive views of the meal plan and its writes. Callers wrap writes in asParent(). */

export const recipesById = computed(() => new Map(data.recipes.value.map((r) => [r.id, r])));
export const categories = computed(() => settings.value.mealCategories);
export const visibleCategories = computed(() => categories.value.filter((c) => c.visible));
export const categoryById = computed(() => new Map(categories.value.map((c) => [c.id, c])));

/** Weeks paged away from the current one on the Meals tab. */
export const weekOffset = signal(0);
export const weekStartDate = computed(() => weekOf(today.value, settings.value.weekStart, weekOffset.value));

/** The cell (or entry) the Plan Meal sheet is open for; the grid outlines it. */
export const planTarget = signal<{ date: ISODate; category: MealCategoryId; entry?: MealEntry } | null>(null);

export interface PlanInput {
  date: ISODate;
  category: MealCategoryId;
  title: string;
  recipeId?: string;
  notes?: string;
  repeat?: Repeat;
}

export function planMeal(p: PlanInput): MealEntry {
  const entry: MealEntry = {
    id: newId(),
    ...p,
    notes: p.notes?.trim() || undefined,
    order: nextCellOrder(data.meals.value, p.date, p.category),
    createdAt: currentTime(),
  };
  void put('meals', entry);
  return entry;
}

export function applyMealOps(ops: MealOp[]): void {
  const b = batch();
  for (const o of ops) {
    if (o.op === 'put') b.put('meals', o.entry);
    else if (o.op === 'patch') b.patch('meals', o.id, o.data);
    else b.remove('meals', o.id);
  }
  void b.commit();
}

/** Change or remove one occurrence (see plan.editOccurrence). Returns an undo. */
export function changeOccurrence(
  entry: MealEntry,
  date: ISODate,
  scope: Scope,
  changes: Partial<Omit<MealEntry, 'id'>> | null,
): () => void {
  const ops = editOccurrence(entry, date, scope, changes, newId);
  applyMealOps(ops);
  const created = ops.flatMap((o) => (o.op === 'put' && o.entry.id !== entry.id ? [o.entry.id] : []));
  return () => applyMealOps([{ op: 'put', entry }, ...created.map((id) => ({ op: 'remove' as const, id }))]);
}

export interface CalendarMeal {
  date: ISODate;
  entry: MealEntry;
  category: MealCategory;
  emoji?: string;
}

/**
 * Planned meals for the calendar in [from, to]: only categories that are
 * visible and set to show on the calendar, in category order within a day.
 * (The Calendar Filter's "Meals" switch is the caller's to apply.)
 */
export function calendarMeals(from: ISODate, to: ISODate): CalendarMeal[] {
  const cats = categories.value;
  const rank = new Map(cats.map((c, i) => [c.id, i]));
  return mealOccurrences(data.meals.value, from, to)
    .flatMap((o) => {
      const category = categoryById.value.get(o.entry.category);
      if (!category?.visible || !category.showOnCalendar) return [];
      const emoji = o.entry.recipeId ? recipesById.value.get(o.entry.recipeId)?.emoji : undefined;
      return [{ date: o.date, entry: o.entry, category, emoji }];
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank.get(a.category.id)! - rank.get(b.category.id)!));
}

/** The emoji shown with a planned meal: its recipe's. */
export const mealEmoji = (entry: MealEntry): string | undefined =>
  entry.recipeId ? recipesById.value.get(entry.recipeId)?.emoji : undefined;

export const recipeOf = (entry: MealEntry): Recipe | undefined =>
  entry.recipeId ? recipesById.value.get(entry.recipeId) : undefined;
