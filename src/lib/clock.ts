import { computed, signal } from '@preact/signals';
import { toISODate } from './date';

/**
 * The app's notion of "now". `?now=2026-11-04T11:44` pins a start time for
 * screenshots and tests; the clock then runs forward from it.
 */
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const pinned = params.get('now');
const offset = pinned ? new Date(pinned).getTime() - Date.now() : 0;

export const nowMs = signal(Date.now() + offset);
export const now = computed(() => new Date(nowMs.value));
/** Today's local ISO date; changes at midnight. */
export const today = computed(() => toISODate(now.value));

if (typeof window !== 'undefined') {
  const tick = () => {
    nowMs.value = Date.now() + offset;
  };
  // Align to the minute boundary for the header clock, but tick often enough
  // for the now-line and timers.
  setInterval(tick, 1000);
}

export const currentTime = () => Date.now() + offset;
