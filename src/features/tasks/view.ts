import { computed, effect, signal } from '@preact/signals';
import { settings } from '../../data/store';
import { addDays, minutesOfDay, startOfWeek } from '../../lib/date';
import { now, today } from '../../lib/clock';
import { firstHistoryDay, partOfDay, type Section } from '../../tasks/engine';
import { DEFAULT_FILTER, type TaskFilter } from './logic';

/** Tasks tab view state: Day or Week, paging, the filter and section toggles. */

export const mode = signal<'day' | 'week'>('day');
/** Days from today shown in the Day view. */
export const dayOffset = signal(0);
/** Weeks from this week shown in the Week view. */
export const weekOffset = signal(0);
/** Profile (or UP_FOR_GRABS) shown in the Week view; null = the first column. */
export const weekOwner = signal<string | null>(null);

export const selectedDay = computed(() => addDays(today.value, dayOffset.value));
/** Paging stops at the first day of the task history. */
export const firstDay = computed(() => firstHistoryDay(today.value));
export const weekStart = computed(() => startOfWeek(addDays(today.value, weekOffset.value * 7), settings.value.weekStart));
export const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)));

/** Changes three times a day, so readers do not re-render with the seconds clock. */
export const currentPart = computed(() => partOfDay(minutesOfDay(now.value)));

/* The filter is per device (the wall and a phone may want different columns). */
const FILTER_KEY = 'manwar.tasksFilter.v1';

function loadFilter(): TaskFilter {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    return raw ? { ...DEFAULT_FILTER, ...(JSON.parse(raw) as Partial<TaskFilter>) } : DEFAULT_FILTER;
  } catch {
    return DEFAULT_FILTER;
  }
}

export const taskFilter = signal<TaskFilter>(loadFilter());
effect(() => {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(taskFilter.value));
  } catch {
    /* storage unavailable: the filter lasts for this session */
  }
});

/** Section toggles that differ from the defaults, keyed by `${day}:${columnId}`. */
export const sectionToggles = signal<Record<string, Partial<Record<Section, boolean>>>>({});

export function toggleSection(day: string, columnId: string, s: Section, currentlyOpen: boolean): void {
  const key = `${day}:${columnId}`;
  sectionToggles.value = { ...sectionToggles.value, [key]: { ...sectionToggles.value[key], [s]: !currentlyOpen } };
}
