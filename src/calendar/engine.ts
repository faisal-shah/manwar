import { computed, signal } from '@preact/signals';
import { demoMode } from '../config';
import { data, profileById, put, remove as removeDoc, settings } from '../data/store';
import { EVERYONE, type EventMeta, type ISODate } from '../data/types';
import { addDays, addMonths, dateAt, diffDays, toISODate } from '../lib/date';
import { currentTime, today } from '../lib/clock';
import { fakeSource } from './fake';
import { googleSource } from './google';
import { eventKey, type CalEvent, type CalendarInfo, type CalendarSource, type EditScope, type EventDraft } from './types';

/**
 * Calendar state for the wall. Events come from the household's Google
 * calendars (or the demo source), are cached in localStorage so the wall
 * shows them offline, and are joined with app-side EventMeta (profiles,
 * countdown) from Firestore.
 */

export const source: CalendarSource = demoMode ? fakeSource : googleSource;

export const calendars = signal<CalendarInfo[]>([]);
export const events = signal<CalEvent[]>([]);
export const sync = signal<{ loading: boolean; lastSync: number | null; error: string | null }>({
  loading: false,
  lastSync: null,
  error: null,
});

/** Loaded window [from, to) as ISO dates. Views call ensureRange to widen it. */
let loadedFrom: ISODate = addDays(today.value, -42);
let loadedTo: ISODate = addMonths(today.value, 4);

const SNAPSHOT_KEY = demoMode ? 'manwar.demoEvents.v1' : 'manwar.events.v1';

interface Snapshot {
  calendars: CalendarInfo[];
  events: (Omit<CalEvent, 'start' | 'end'> & { start: number; end: number })[];
  from: ISODate;
  to: ISODate;
  at: number;
}

function saveSnapshot() {
  try {
    const s: Snapshot = {
      calendars: calendars.value,
      events: events.value.map((e) => ({ ...e, start: e.start.getTime(), end: e.end.getTime() })),
      from: loadedFrom,
      to: loadedTo,
      at: Date.now(),
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
  } catch {
    /* quota or storage unavailable: the next sync repopulates */
  }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as Snapshot;
    calendars.value = s.calendars;
    events.value = s.events.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
    sync.value = { ...sync.value, lastSync: s.at };
  } catch {
    /* corrupt snapshot: ignore */
  }
}

const visibleCalendars = () => calendars.value.filter((c) => !settings.value.hiddenCalendars.includes(c.id));

let inflight: Promise<void> | null = null;

/** Re-fetch every shown calendar for the loaded window. */
export function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    sync.value = { ...sync.value, loading: true };
    try {
      calendars.value = await source.listCalendars();
      const timeMin = dateAt(loadedFrom);
      const timeMax = dateAt(loadedTo);
      const lists = await Promise.all(visibleCalendars().map((c) => source.listEvents(c.id, timeMin, timeMax)));
      events.value = lists.flat().sort((a, b) => a.start.getTime() - b.start.getTime());
      sync.value = { loading: false, lastSync: Date.now(), error: null };
      saveSnapshot();
    } catch (e) {
      sync.value = { ...sync.value, loading: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Make sure [from, to] is loaded (views call this when paging). */
export function ensureRange(from: ISODate, to: ISODate): void {
  let grew = false;
  if (from < loadedFrom) {
    loadedFrom = addDays(from, -14);
    grew = true;
  }
  if (to >= loadedTo) {
    loadedTo = addDays(to, 30);
    grew = true;
  }
  if (grew) void refresh();
}

let started = false;
const POLL_MS = 3 * 60_000;

export function startCalendarSync(): void {
  if (started) return;
  started = true;
  loadSnapshot();
  void refresh();
  setInterval(() => void refresh(), POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  window.addEventListener('online', () => void refresh());
}

/* ---------- Event metadata (profiles, countdowns) ---------- */

/** EventMeta document id for an event or a series. */
export const metaKey = (calendarId: string, id: string) => encodeURIComponent(eventKey(calendarId, id));

const metaById = computed(() => new Map(data.eventMeta.value.map((m) => [m.id, m])));

/** Instance-level meta wins over series-level meta. */
export function metaFor(ev: CalEvent): EventMeta | undefined {
  const m = metaById.value;
  return m.get(metaKey(ev.calendarId, ev.id)) ?? (ev.seriesId ? m.get(metaKey(ev.calendarId, ev.seriesId)) : undefined);
}

/** Assigned profile ids ([EVERYONE] for the family), or null when unassigned. */
export function profilesOf(ev: CalEvent): string[] | null {
  const meta = metaFor(ev);
  if (!meta) return null;
  const known = profileById.value;
  const ids = meta.profiles.filter((p) => p === EVERYONE || known.has(p));
  return ids.length ? ids : null;
}

export const UNASSIGNED_COLOR = '#C9CED6';

/** Colors to draw an event with: one per profile (striped when several). */
export function eventColors(ev: CalEvent): string[] {
  const ids = profilesOf(ev);
  if (!ids) return [UNASSIGNED_COLOR];
  if (ids.includes(EVERYONE)) return [settings.value.familyColor];
  const known = profileById.value;
  return ids.map((id) => known.get(id)!.color);
}

/** Is the event shown under the current profile filter? Unassigned events always show. */
export function passesFilter(ev: CalEvent): boolean {
  const hidden = settings.value.filter.hiddenProfiles;
  if (!hidden.length) return true;
  const ids = profilesOf(ev);
  if (!ids || ids.includes(EVERYONE)) return true;
  return ids.some((id) => !hidden.includes(id));
}

/** Events overlapping [from, to] (inclusive ISO dates), filtered. */
export function eventsBetween(from: ISODate, to: ISODate): CalEvent[] {
  const a = dateAt(from).getTime();
  const b = dateAt(addDays(to, 1)).getTime();
  return events.value.filter((e) => e.end.getTime() > a && e.start.getTime() < b && passesFilter(e));
}

/** Events on one day, all-day first, then by start. */
export function eventsOn(day: ISODate): CalEvent[] {
  return eventsBetween(day, day).sort((x, y) => Number(y.allDay) - Number(x.allDay) || x.start.getTime() - y.start.getTime());
}

/** ISO dates an event covers (all-day end is exclusive). */
export function daysOf(ev: CalEvent): ISODate[] {
  const first = toISODate(ev.start);
  const lastInstant = new Date(ev.end.getTime() - 1);
  const last = ev.allDay || toISODate(lastInstant) !== first ? toISODate(lastInstant) : first;
  const out: ISODate[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Triage queue: upcoming events nobody is assigned to, one row per series
 * (its next occurrence), soonest first.
 */
export const unassigned = computed(() => {
  void data.eventMeta.value;
  void profileById.value;
  const from = dateAt(today.value).getTime();
  const seen = new Set<string>();
  const out: CalEvent[] = [];
  for (const ev of events.value) {
    if (ev.end.getTime() <= from || settings.value.hiddenCalendars.includes(ev.calendarId)) continue;
    const series = eventKey(ev.calendarId, ev.seriesId ?? ev.id);
    if (seen.has(series)) continue;
    seen.add(series);
    if (!profilesOf(ev)) out.push(ev);
  }
  return out;
});

/**
 * Assign profiles. 'series' writes the series-level entry (and clears this
 * occurrence's override); 'instance' writes an override for one occurrence.
 */
export function assign(ev: CalEvent, profileIds: string[], scope: 'series' | 'instance' = 'series'): void {
  const base = metaFor(ev);
  const id = scope === 'series' && ev.seriesId ? metaKey(ev.calendarId, ev.seriesId) : metaKey(ev.calendarId, ev.id);
  void put('eventMeta', { ...base, id, profiles: profileIds, updatedAt: currentTime() });
  if (scope === 'series' && ev.seriesId) {
    const inst = metaKey(ev.calendarId, ev.id);
    if (data.eventMeta.value.some((m) => m.id === inst)) void removeDoc('eventMeta', inst);
  }
}

export function setCountdown(ev: CalEvent, on: boolean): void {
  const base = metaFor(ev);
  const id = ev.seriesId ? metaKey(ev.calendarId, ev.seriesId) : metaKey(ev.calendarId, ev.id);
  void put('eventMeta', { profiles: [], ...base, id, countdown: on, updatedAt: currentTime() });
}

/** Countdown events within the configured window, soonest first, one per series. */
export const countdowns = computed(() => {
  void data.eventMeta.value;
  const t0 = today.value;
  const win = settings.value.countdownWindow;
  const horizon = win === 'always' ? '9999-12-31' : addMonths(t0, win === '3m' ? 3 : 1);
  const seen = new Set<string>();
  const out: { ev: CalEvent; days: number }[] = [];
  for (const ev of events.value) {
    const day = toISODate(ev.start);
    if (day < t0 || day > horizon || !passesFilter(ev)) continue;
    const series = eventKey(ev.calendarId, ev.seriesId ?? ev.id);
    if (seen.has(series) || !metaFor(ev)?.countdown) continue;
    seen.add(series);
    out.push({ ev, days: diffDays(t0, day) });
  }
  return out.sort((a, b) => a.days - b.days);
});

/* ---------- Writes ---------- */

export const writableCalendars = computed(() =>
  calendars.value.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer'),
);

export function defaultCalendarId(): string {
  const w = writableCalendars.value;
  const chosen = settings.value.defaultCalendarId;
  return (w.find((c) => c.id === chosen) ?? w.find((c) => c.primary) ?? w[0])?.id ?? '';
}

export async function createEvent(
  calendarId: string,
  draft: EventDraft,
  profileIds: string[],
  opts: { countdown?: boolean } = {},
): Promise<void> {
  const { id } = await source.insert(calendarId, draft);
  // Firestore writes apply to the local cache at once; awaiting the server ack would hang offline.
  void put('eventMeta', {
    id: metaKey(calendarId, id),
    profiles: profileIds,
    countdown: opts.countdown,
    updatedAt: currentTime(),
  });
  await refresh();
}

export async function updateEvent(
  ev: CalEvent,
  draft: EventDraft,
  scope: EditScope,
  profileIds: string[],
  opts: { countdown?: boolean } = {},
): Promise<void> {
  const before = metaFor(ev);
  const { newSeriesId } = await source.update(ev, draft, scope);
  const meta = { profiles: profileIds, countdown: opts.countdown, updatedAt: currentTime() };
  const id = newSeriesId ?? (ev.seriesId && scope === 'this' ? ev.id : (ev.seriesId ?? ev.id));
  void put('eventMeta', { ...before, ...meta, id: metaKey(ev.calendarId, id) });
  await refresh();
}

export async function deleteEvent(ev: CalEvent, scope: EditScope): Promise<void> {
  await source.remove(ev, scope);
  if (!ev.seriesId || scope === 'all') void removeDoc('eventMeta', metaKey(ev.calendarId, ev.seriesId ?? ev.id)).catch(() => {});
  await refresh();
}

/** The series' editable repeat rule (null when it can't be represented), for the editor. */
export async function seriesRecurrence(ev: CalEvent): Promise<string[]> {
  return ev.seriesId ? source.seriesRecurrence(ev.calendarId, ev.seriesId) : [];
}

/** Days until a date from today (negative in the past). */
export const daysUntil = (day: ISODate) => diffDays(today.value, day);
