import { timeAgo } from '../features/messages/logic';

/** A failing calendar sync shows on the wall once the events are this old (a short Wi-Fi drop stays quiet). */
export const STALE_SYNC_MS = 15 * 60_000;
/** The current-weather reading is hidden once it is this old (the forecast keeps showing). */
export const STALE_WEATHER_MS = 3 * 60 * 60_000;

/** The reading to show in the top bar: none once fetches have failed for STALE_WEATHER_MS. */
export const currentWeather = <W extends { fetchedAt: number }>(w: W | null, now: number): W | null =>
  w && now - w.fetchedAt < STALE_WEATHER_MS ? w : null;

export interface CalendarStatus {
  text: string;
  /** Only connecting Google again fixes it. */
  reconnect: boolean;
}

/**
 * What the top bar says about the calendar connection, or null when all is
 * well. `problem` is a Google problem only a reconnect fixes; otherwise a
 * failing sync is shown once the last good one is STALE_SYNC_MS old.
 */
export function calendarStatus(
  sync: { lastSync: number | null; error: string | null },
  problem: string | null,
  now: number,
): CalendarStatus | null {
  if (problem) return { text: 'Reconnect Google Calendar', reconnect: true };
  if (!sync.error) return null;
  if (sync.lastSync === null) return { text: 'Calendar not loaded', reconnect: false };
  if (now - sync.lastSync < STALE_SYNC_MS) return null;
  return { text: `Calendar updated ${timeAgo(sync.lastSync, now)}`, reconnect: false };
}
