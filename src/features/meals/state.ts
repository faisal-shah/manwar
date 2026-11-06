import { computed, signal } from '@preact/signals';
import { DEFAULT_MEAL_CATEGORIES } from '../../data/settings';
import { batch, data, fieldChanges, newId, put, settings } from '../../data/store';
import type { ISODate, MealCategory, MealCategoryId, MealEntry, Recipe, Repeat } from '../../data/types';
import { goTo } from '../../app/nav';
import { currentTime, today } from '../../lib/clock';
import { diffDays } from '../../lib/date';
import { editOccurrence, mealOccurrences, nextCellOrder, undoOps, weekOf, type MealOp, type Scope } from './plan';

/** Reactive views of the meal plan and its writes. Callers wrap writes in asParent(). */

const recipesById = computed(() => new Map(data.recipes.value.map((r) => [r.id, r])));
/** The meal categories in their fixed order. */
export const categories = computed(() => DEFAULT_MEAL_CATEGORIES.map((c) => settings.value.mealCategories[c.id]));
export const visibleCategories = computed(() => categories.value.filter((c) => c.visible));
export const categoryById = computed(() => new Map(categories.value.map((c) => [c.id, c])));

/** Weeks paged away from the current one on the Meals tab. */
export const weekOffset = signal(0);
export const weekStartDate = computed(() => weekOf(today.value, settings.value.weekStart, weekOffset.value));

/** Show the Meals tab at the week holding `date` (a meal tapped on the calendar). */
export function openMealsWeek(date: ISODate): void {
  const ws = settings.value.weekStart;
  weekOffset.value = diffDays(weekOf(today.value, ws), weekOf(date, ws)) / 7;
  goTo('meals');
}

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

function applyMealOps(ops: MealOp[]): void {
  const b = batch();
  for (const o of ops) {
    if (o.op === 'put') b.put('meals', o.entry);
    else if (o.op === 'patch') b.patch('meals', o.id, fieldChanges(o.data) as Partial<MealEntry>);
    else b.remove('meals', o.id);
  }
  void b.commit();
}

/** The planned meal as the store has it now; undefined once it is deleted. */
export const liveMeal = (id: string) => data.meals.value.find((m) => m.id === id);

/**
 * Change or remove one occurrence (see plan.editOccurrence) of `entry` as
 * the store has it now, not as the caller saw it. Returns an undo, or null
 * when the entry was deleted meanwhile (nothing is written).
 */
export function changeOccurrence(
  entry: MealEntry,
  date: ISODate,
  scope: Scope,
  changes: Partial<Omit<MealEntry, 'id'>> | null,
): (() => void) | null {
  const live = liveMeal(entry.id);
  if (!live) return null;
  const ops = editOccurrence(live, date, scope, changes, newId);
  applyMealOps(ops);
  const undo = undoOps(live, ops);
  // A patch on an entry deleted since would fail the whole batch.
  return () => applyMealOps(undo.filter((o) => o.op !== 'patch' || liveMeal(o.id)));
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
