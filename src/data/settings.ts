import { arrayRemove, arrayUnion, deleteField } from 'firebase/firestore';
import type { HomePane, MealCategory, MealCategoryId, Settings, SettingsPatch, TabId, TimeWindow } from './types';

export const DEFAULT_MEAL_CATEGORIES: MealCategory[] = [
  { id: 'breakfast', name: 'Breakfast', color: '#F2B074', visible: true, showOnCalendar: false },
  { id: 'lunch', name: 'Lunch', color: '#82D7DC', visible: true, showOnCalendar: false },
  { id: 'dinner', name: 'Dinner', color: '#CB434C', visible: true, showOnCalendar: true },
  { id: 'snack', name: 'Snack', color: '#D9C3A5', visible: true, showOnCalendar: true },
];

const byId = (cats: MealCategory[]) => Object.fromEntries(cats.map((c) => [c.id, c])) as Settings['mealCategories'];

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
  mealCategories: byId(DEFAULT_MEAL_CATEGORIES),
  weather: null,
  tempUnit: 'f',
  hiddenTabs: [],
  homeHiddenPanes: [],
  textScale: 'medium',
  night: { enabled: false, from: '20:30', to: '06:30' },
  sleep: { enabled: false, from: '22:30', to: '06:00' },
  idleHomeMinutes: 0,
  restingFace: 'family',
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
  s.mealCategories = byId(DEFAULT_MEAL_CATEGORIES.map((c) => ({ ...c, ...stored.mealCategories?.[c.id], id: c.id })));
  return s;
}

/*
 * Changes for saveSettings that keep another tablet's change. The settings
 * are one document every tablet writes, so a change names only the fields
 * it changes, and a list gains or loses one element where it stands on the
 * server instead of being rewritten from this tablet's copy.
 */

/** Elements added to a stored list (arrayUnion), typed as the list. */
export const listAdd = <T>(...values: T[]) => arrayUnion(...values) as unknown as T[];
/** Elements taken out of a stored list (arrayRemove), typed as the list. */
export const listRemove = <T>(...values: T[]) => arrayRemove(...values) as unknown as T[];
/** A field deleted from the stored map (deleteField), typed as the field. */
const removed = <T>() => deleteField() as unknown as T;

/** The fields of `next` that differ from `was`: the change a draft made, and nothing it did not touch. */
export function changedFields<T extends object>(was: T, next: T): Partial<T> {
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => was[k as keyof T] !== v)) as Partial<T>;
}

/** Some of the Calendar filter's switches. */
export const filterChange = (patch: Partial<Settings['filter']>): SettingsPatch => ({ filter: patch });

/** Show or hide one profile's events in the Calendar filter. */
export const profileShownChange = (id: string, shown: boolean): SettingsPatch =>
  filterChange({ hiddenProfiles: shown ? listRemove(id) : listAdd(id) });

type HiddenLists = { hiddenCalendars: string; hiddenTabs: TabId; homeHiddenPanes: HomePane };

/** Hide (`hidden`) or show one calendar, tab or Home pane. */
export const hiddenChange = <K extends keyof HiddenLists>(key: K, value: HiddenLists[K], hidden: boolean): SettingsPatch =>
  ({ [key]: hidden ? listAdd(value) : listRemove(value) }) as SettingsPatch;

/** Some fields of one meal category. */
export const mealCategoryChange = (id: MealCategoryId, patch: Partial<Omit<MealCategory, 'id'>>): SettingsPatch => ({
  mealCategories: { [id]: patch },
});

/** Some fields of the night or sleep window. */
export const windowChange = (key: 'night' | 'sleep', patch: Partial<TimeWindow>): SettingsPatch => ({ [key]: patch });

/** Lock again after this many idle minutes. */
export const relockChange = (relockMinutes: number): SettingsPatch => ({ lock: { relockMinutes } });

/** A new PIN (its salt and hash), or null to remove the PIN. */
export const pinChange = (pin: { salt: string; pinHash: string } | null): SettingsPatch => ({
  lock: pin ?? { salt: removed<string>(), pinHash: removed<string>() },
});
