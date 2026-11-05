import { describe, expect, it, vi } from 'vitest';
import type { Settings, SettingsPatch } from '../../src/data/types';

/**
 * Two tablets change the household's settings document from their own
 * copies. Each change goes through a stand-in for Firestore's merge (maps
 * merge, lists are replaced, arrayUnion/arrayRemove apply to the stored
 * list), so a change that rewrote a whole value from a stale copy would
 * undo the other tablet's.
 */

vi.mock('firebase/firestore', () => ({
  arrayUnion: (...values: unknown[]) => ({ op: 'union', values }),
  arrayRemove: (...values: unknown[]) => ({ op: 'remove', values }),
}));

const { DEFAULT_SETTINGS, filterChange, hiddenChange, mealCategoryChange, mergeSettings, profileShownChange } =
  await import('../../src/data/settings');

type Op = { op: 'union' | 'remove'; values: unknown[] };
const isOp = (v: unknown): v is Op => typeof v === 'object' && v !== null && 'op' in v;

function merge(doc: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  for (const [k, v] of Object.entries(patch)) {
    const was = out[k];
    if (isOp(v)) {
      const list = Array.isArray(was) ? was : [];
      out[k] =
        v.op === 'union' ? [...list, ...v.values.filter((x) => !list.includes(x))] : list.filter((x) => !v.values.includes(x));
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = merge(
        was && typeof was === 'object' && !Array.isArray(was) ? (was as Record<string, unknown>) : {},
        v as Record<string, unknown>,
      );
    } else out[k] = v;
  }
  return out;
}

/** The stored document, and what a tablet reads from it. */
let stored: Record<string, unknown> = {};
const read = (): Settings => mergeSettings(stored as Partial<Settings>);
const write = (p: SettingsPatch) => (stored = merge(stored, p as Record<string, unknown>));

describe('settings changes from two tablets', () => {
  it('keeps both tablets’ Calendar filter changes', () => {
    stored = {};
    const kitchen = read();
    const hall = read();
    write(filterChange({ weather: !kitchen.filter.weather }));
    write(filterChange({ meals: !hall.filter.meals }));
    write(profileShownChange('asiyah', false));
    write(profileShownChange('hashim', false));
    expect(read().filter).toEqual({
      ...DEFAULT_SETTINGS.filter,
      weather: false,
      meals: false,
      hiddenProfiles: ['asiyah', 'hashim'],
    });
    // One tablet shows Asiyah again; the other's hidden Hashim stays hidden.
    write(profileShownChange('asiyah', true));
    expect(read().filter.hiddenProfiles).toEqual(['hashim']);
  });

  it('keeps both tablets’ meal category edits', () => {
    stored = {};
    write(mealCategoryChange('dinner', { name: 'Supper' }));
    write(mealCategoryChange('snack', { showOnCalendar: false }));
    write(mealCategoryChange('dinner', { color: '#123456' }));
    const cats = read().mealCategories;
    expect(cats.dinner).toEqual({ id: 'dinner', name: 'Supper', color: '#123456', visible: true, showOnCalendar: true });
    expect(cats.snack).toMatchObject({ name: 'Snack', showOnCalendar: false });
    expect(cats.breakfast).toEqual(DEFAULT_SETTINGS.mealCategories.breakfast);
  });

  it('keeps both tablets’ hidden calendars, tabs and Home panes', () => {
    stored = {};
    write(hiddenChange('hiddenCalendars', 'school@group.calendar.google.com', true));
    write(hiddenChange('hiddenCalendars', 'holidays@group.v.calendar.google.com', true));
    write(hiddenChange('hiddenTabs', 'recipes', true));
    write(hiddenChange('hiddenTabs', 'rewards', true));
    write(hiddenChange('hiddenTabs', 'recipes', false));
    write(hiddenChange('homeHiddenPanes', 'lists', true));
    const s = read();
    expect(s.hiddenCalendars).toEqual(['school@group.calendar.google.com', 'holidays@group.v.calendar.google.com']);
    expect(s.hiddenTabs).toEqual(['rewards']);
    expect(s.homeHiddenPanes).toEqual(['lists']);
  });
});
