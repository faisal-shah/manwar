import type { ISODate, MealCategory, MealCategoryId, MealEntry } from '../../data/types';
import { byCell, cellKey, mealOccurrences, weekDays } from '../../features/meals/plan';

export interface PlannedMeal {
  category: MealCategory;
  entry: MealEntry;
}

export interface DayMeals {
  date: ISODate;
  /** In category order (only the categories given), then in each cell's order. */
  meals: PlannedMeal[];
}

function inOrder(cells: Map<string, MealEntry[]>, date: ISODate, categories: MealCategory[]): PlannedMeal[] {
  return categories.flatMap((category) => (cells.get(cellKey(date, category.id)) ?? []).map((entry) => ({ category, entry })));
}

/** The meals planned on `date` (repeating ones included) in the given categories. */
export function mealsOn(entries: MealEntry[], date: ISODate, categories: MealCategory[]): PlannedMeal[] {
  return inOrder(byCell(mealOccurrences(entries, date, date)), date, categories);
}

/** The week from `start`, day by day, as the phone lists it. */
export function weekByDay(entries: MealEntry[], start: ISODate, categories: MealCategory[]): DayMeals[] {
  const days = weekDays(start);
  const cells = byCell(mealOccurrences(entries, days[0], days[6]));
  return days.map((date) => ({ date, meals: inOrder(cells, date, categories) }));
}

/** The category a day's Plan starts on: the first shown one with nothing planned yet, else dinner, else the first. */
export function planCategory(day: DayMeals, categories: MealCategory[]): MealCategoryId | null {
  const empty = categories.find((c) => !day.meals.some((m) => m.category.id === c.id));
  return (empty ?? categories.find((c) => c.id === 'dinner') ?? categories[0])?.id ?? null;
}
