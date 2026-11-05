import type { SyncState } from '../calendar/engine';
import { timeAgo } from '../features/messages/logic';

/** A failing calendar sync shows on the wall once the events are this old (a short Wi-Fi drop stays quiet). */
export const STALE_SYNC_MS = 15 * 60_000;
/** The current-weather reading is hidden once it is this old (the forecast keeps showing). */
export const STALE_WEATHER_MS = 3 * 60 * 60_000;

/** The reading to show in the top bar: none once fetches have failed for STALE_WEATHER_MS. */
export const currentWeather = <W extends { fetchedAt: number }>(w: W | null, now: number): W | null =>
  w && now - w.fetchedAt < STALE_WEATHER_MS ? w : null;

/**
 * What the top bar says while a household listener is down and waits to
 * listen again (`loadError`), or null. The wall shows that data as it last
 * came in, and holds a check-off, redemption or undo until the listeners
 * it is shown by are back, so a second tap on it does nothing meanwhile.
 */
export function householdStatus(loadError: string | null): { text: string; detail: string } | null {
  return loadError
    ? { text: 'Not syncing', detail: `The household's data is not coming in (${loadError}). Trying again shortly.` }
    : null;
}

export interface CalendarStatus {
  text: string;
  /** Only connecting Google again fixes it. */
  reconnect: boolean;
}

/**
 * What the top bar says about the calendar connection, or null when all is
 * well. `problem` is a Google problem only a reconnect fixes; otherwise a
 * failing sync is shown once the events it leaves on the wall are
 * STALE_SYNC_MS old. When only some calendars fail, it names them (one by
 * name) and their age, not the others'.
 */
export function calendarStatus(
  sync: Pick<SyncState, 'lastSync' | 'error' | 'failing' | 'partial'>,
  problem: string | null,
  now: number,
): CalendarStatus | null {
  if (problem) return { text: 'Reconnect Google Calendar', reconnect: true };
  if (!sync.error) return null;
  const ages = sync.failing.map((f) => f.at);
  const at = !ages.length ? sync.lastSync : ages.includes(null) ? null : Math.min(...(ages as number[]));
  const n = sync.failing.length;
  const who = !sync.partial ? 'Calendar' : n === 1 ? sync.failing[0].name : `${n} calendars`;
  if (at === null) return { text: `${who} not loaded`, reconnect: false };
  if (now - at < STALE_SYNC_MS) return null;
  return { text: `${who} updated ${timeAgo(at, now)}`, reconnect: false };
}

/** Writes stay quiet this long (a write on its way to a live connection takes a moment). */
export const UNSENT_QUIET_MS = 4000;

/**
 * What the phone says about changes it made that the server has not taken
 * yet (`unsent`, queued since `since`), or null. It keeps them in memory
 * only, so they are lost if the phone's browser closes the page first.
 */
export function unsentStatus(unsent: number, since: number | null, now: number): string | null {
  if (!unsent || since === null || now - since < UNSENT_QUIET_MS) return null;
  return `${unsent === 1 ? '1 change' : `${unsent} changes`} not sent yet: keep Manwar open until the phone is online`;
}
