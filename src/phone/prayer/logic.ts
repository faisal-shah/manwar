import type { Place } from '../../data/types';
import { clockState, computeDays, PERIOD_NAMES, type Slot } from '../../prayer/core/schedule';
import type { Settings } from '../../prayer/core/settings';
import { formatTime, type TimeFormat } from '../../lib/date';

/**
 * The prayer day a phone shows (pure): today's five prayers and the next
 * one, by the wall's own schedule (prayer/core/schedule.ts: Jumu'ah on a
 * Friday, the adjustments, the iqamah offsets); null before the household
 * has a place for its prayer times.
 */
export function prayerDay(now: Date, place: Place | null, s: Settings): { slots: Slot[]; next: Slot } | null {
  if (!place) return null;
  const st = clockState(now, computeDays(now, place, s), s, () => null);
  return { slots: st.slots, next: st.next };
}

/** A prayer's name as the wall says it ("Jumu'ah" for Friday's Dhuhr). */
export const slotName = (slot: Slot) => PERIOD_NAMES[slot.name];

/**
 * `d` on the clock of the place the prayer times are for, wherever the
 * phone is: the family's times stay the family's on a trip. A time zone
 * this browser does not know shows the phone's own clock.
 */
export function placeTime(d: Date, place: Place, fmt: TimeFormat): string {
  let there = d;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: place.timezone,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(d);
    const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    there = new Date(d);
    there.setHours(n('hour'), n('minute'), 0, 0);
  } catch {
    // RangeError: an unknown time zone.
  }
  return formatTime(there, fmt);
}

/** "Asr 4:04 PM · iqamah 4:19 PM" */
export const nextLine = (next: Slot, place: Place, fmt: TimeFormat) =>
  `${slotName(next)} ${placeTime(next.athan, place, fmt)} · iqamah ${placeTime(next.iqamah, place, fmt)}`;
