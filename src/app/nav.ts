import { effect, signal } from '@preact/signals';
import { settings } from '../data/store';
import type { TabId } from '../data/types';
import { currentTime } from '../lib/clock';

export const activeTab = signal<TabId>('calendar');
/** Settings sheet and Sleep popover, opened from the bottom of the rail. */
export const settingsOpen = signal(false);
export const sleepMenuOpen = signal(false);

export function goTo(tab: TabId): void {
  activeTab.value = tab;
}

let lastTouch = currentTime();

/** Return to Home after the configured idle time (DAKboard-style). */
export function startIdleReturn(): void {
  window.addEventListener('pointerdown', () => (lastTouch = currentTime()), { capture: true, passive: true });
  setInterval(() => {
    const m = settings.value.idleHomeMinutes;
    if (m > 0 && activeTab.value !== 'home' && currentTime() - lastTouch > m * 60_000 && !settingsOpen.value)
      activeTab.value = 'home';
  }, 15_000);
  // Never leave the wall on a tab that was just hidden.
  effect(() => {
    if (settings.value.hiddenTabs.includes(activeTab.value)) activeTab.value = 'calendar';
  });
}
