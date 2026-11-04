import type { MealCategory, Settings } from './types';

export const DEFAULT_MEAL_CATEGORIES: MealCategory[] = [
  { id: 'breakfast', name: 'Breakfast', color: '#F2B074', visible: true, showOnCalendar: false },
  { id: 'lunch', name: 'Lunch', color: '#82D7DC', visible: true, showOnCalendar: false },
  { id: 'dinner', name: 'Dinner', color: '#CB434C', visible: true, showOnCalendar: true },
  { id: 'snack', name: 'Snack', color: '#D9C3A5', visible: true, showOnCalendar: true },
];

export const DEFAULT_SETTINGS: Settings = {
  weekStart: 0,
  scheduleDays: 4,
  scheduleStartToday: true,
  monthStartCurrentWeek: false,
  weekStartToday: false,
  dimPast: true,
  shadeWeekends: false,
  stripeMultiProfile: true,
  countdownWindow: '3m',
  timeFormat: '12h',
  hiddenCalendars: [],
  familyColor: '#A8D4D3',
  filter: { taskProgress: true, countdowns: true, weather: true, meals: true, hiddenProfiles: [] },
  mealCategories: DEFAULT_MEAL_CATEGORIES,
  weather: null,
  tempUnit: 'f',
  hiddenTabs: [],
  homeHiddenPanes: [],
  textScale: 'medium',
  night: { enabled: false, from: '20:30', to: '06:30' },
  sleep: { enabled: false, from: '22:30', to: '06:00' },
  idleHomeMinutes: 0,
  lock: { relockMinutes: 2 },
  tasksShowAllParts: true,
  sounds: true,
};

/**
 * Overlay a stored settings document onto the defaults. The document is our
 * own Firestore data, so this only fills gaps (new settings added since it
 * was written) and nested objects; it does not re-validate every field.
 */
export function mergeSettings(stored: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...stored } as Settings;
  s.filter = { ...DEFAULT_SETTINGS.filter, ...stored.filter };
  s.lock = { ...DEFAULT_SETTINGS.lock, ...stored.lock };
  s.night = { ...DEFAULT_SETTINGS.night, ...stored.night };
  s.sleep = { ...DEFAULT_SETTINGS.sleep, ...stored.sleep };
  if (!stored.mealCategories?.length) s.mealCategories = DEFAULT_MEAL_CATEGORIES;
  return s;
}
