import { effect, signal } from '@preact/signals';
import { idleFor } from '../core/activity';
import { settings } from '../data/store';
import type { TabId } from '../data/types';
import { fallbackTab } from '../features/settings/logic';
import { closeOverlays } from '../ui/overlays';

export const activeTab = signal<TabId>('calendar');
/** Settings sheet and Sleep popover, opened from the bottom of the rail. */
export const settingsOpen = signal(false);
export const sleepMenuOpen = signal(false);
/** The Settings page shown; it stays put between openings. */
export const settingsPage = signal('profiles');

export function goTo(tab: TabId): void {
  activeTab.value = tab;
}

/** Open Settings, on a given page (e.g. 'profiles' from an empty Tasks tab). */
export function openSettings(page?: string): void {
  if (page) settingsPage.value = page;
  settingsOpen.value = true;
}

const IDLE_CHECK_MS = 15_000;

/**
 * Return to Home after the configured idle time (DAKboard-style). Every
 * sheet, dialog and menu closes too (Settings, an editor, a PIN pad a kid
 * walked away from, which is refused), so nothing left open holds the wall
 * or comes along to Home.
 */
export function startIdleReturn(): void {
  setInterval(() => {
    const m = settings.value.idleHomeMinutes;
    if (m <= 0 || idleFor() <= m * 60_000) return;
    const home = settings.value.hiddenTabs.includes('home') ? fallbackTab(settings.value.hiddenTabs) : 'home';
    closeOverlays();
    activeTab.value = home;
  }, IDLE_CHECK_MS);
  // Never leave the wall on a tab that was just hidden.
  effect(() => {
    const hidden = settings.value.hiddenTabs;
    if (hidden.includes(activeTab.value)) activeTab.value = fallbackTab(hidden);
  });
}
