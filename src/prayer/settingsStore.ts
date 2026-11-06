import { computed } from '@preact/signals';
import { prayerSettingsDoc, savePrayerSettings } from '../data/store';
import { notSaved } from '../ui/overlays';
import { sanitizeSettings, settingsChanges, type Settings } from './core/settings';

/**
 * The prayer clock's settings: the household's `settings/prayer` document
 * over the defaults. The wall's prayer face and the phone's More > Prayer
 * times both read and write them here (this module stays light: no media,
 * no clock). The place they are for is the household's (`settings/main`).
 */
export const settings = computed<Settings>(() => sanitizeSettings(prayerSettingsDoc.value));

/** Merge `changes` (a nested partial) into the prayer settings document; a write the server refuses says so. */
export function savePrayer(changes: Record<string, unknown>): void {
  savePrayerSettings(changes).catch(notSaved('Prayer settings not saved'));
}

/**
 * Apply `patch` (top-level fields, as the settings screens build them) and
 * write only what it changes, field by field (`settingsChanges`), so a
 * change made on another device to the other fields is kept.
 */
export function updateSettings(patch: (s: Settings) => Partial<Settings>): void {
  const was = settings.peek();
  const changes = settingsChanges(was, sanitizeSettings({ ...was, ...patch(was) }));
  if (changes) savePrayer(changes);
}
