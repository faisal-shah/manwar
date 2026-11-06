import { batch as signalBatch, computed, effect, signal, type ReadonlySignal } from '@preact/signals';
import { isPhone } from '../app/layout';
import { demoMode } from '../config';
import { listAdd } from '../data/settings';
import { data, householdId, patch, profileById, put, remove as removeDoc, settings, upsert } from '../data/store';
import { EVERYONE, NOBODY, type EventMeta, type ISODate } from '../data/types';
import { sameIds } from '../lib/assignees';
import { addDays, addMonths, dateAt, diffDays, toISODate } from '../lib/date';
import { currentTime, today } from '../lib/clock';
import { fakeSource } from './fake';
import { googleSource } from './google';
import {
  RateLimited,
  endMs,
  eventKey,
  isHolidayCalendar,
  seriesOf,
  type CalEvent,
  type CalendarInfo,
  type CalendarSource,
  type EditScope,
  type EventDraft,
} from './types';

/**
 * Calendar state for the wall and the phone. Events come from the
 * household's Google calendars (or the demo source), are cached in
 * localStorage so the wall shows them offline (a phone keeps them in memory
 * only), and are joined with app-side EventMeta (profiles, countdown) from
 * Firestore.
 */

export const source: CalendarSource = demoMode ? fakeSource : googleSource;

export const calendars = signal<CalendarInfo[]>([]);
export const events = signal<CalEvent[]>([]);
export interface SyncState {
  loading: boolean;
  /** When every shown calendar last answered in one fetch. */
  lastSync: number | null;
  error: string | null;
  /** After a failed fetch: the shown calendars that did not answer, and when each last did (null: never). */
  failing: { name: string; at: number | null }[];
  /** Some shown calendars answered and only `failing` did not (rather than the whole sync failing). */
  partial: boolean;
}

export const sync = signal<SyncState>({ loading: false, lastSync: null, error: null, failing: [], partial: false });

/** When each calendar's events were last fetched. */
const syncedAt = new Map<string, number>();

type Range = { from: ISODate; to: ISODate };

/** The days the latest view asked for (ensureRange), until that view lets them go. */
let wanted: Range | null = null;

/** The window the fetch under way asks Google for; null between fetches. */
let requested: Range | null = null;

/**
 * The fetched window [from, to): six weeks back and four months ahead of
 * today, widened to the days a view asks for (ensureRange) while it shows
 * them. It follows today, and narrows back once the view lets the far days
 * go, so a wall or phone left open for days does not keep fetching and
 * caching days nobody looks at.
 */
function fetchWindow(): Range {
  const t = today.value;
  let from = addDays(t, -42);
  let to = addMonths(t, 4);
  if (wanted && wanted.from < from) from = addDays(wanted.from, -14);
  if (wanted && wanted.to >= to) to = addDays(wanted.to, 30);
  return { from, to };
}

/**
 * The window of the last fetch any shown calendar answered (or that had
 * no calendar to ask), or of the offline snapshot shown until then,
 * [from, to); null before either. A fetch every calendar failed leaves it
 * as it was: the events on screen are still that window's. A calendar that
 * failed in a fetch the others answered is asked again by the next poll,
 * so a page turn inside the window does not refetch every calendar for it.
 * Days outside it are not known yet: a view that reaches them says so
 * rather than showing them empty.
 */
const loaded = signal<Range | null>(null);
export const loadedRange: ReadonlySignal<Range | null> = loaded;

/** Is the day inside the loaded window? Read in a render, it follows the window. */
export const isLoaded = (day: ISODate): boolean => {
  const r = loaded.value;
  return !!r && r.from <= day && day < r.to;
};

const SNAPSHOT_KEY = demoMode ? 'manwar.demoEvents.v1' : 'manwar.events.v1';

type StoredEvent = Omit<CalEvent, 'start' | 'end' | 'originalStart'> & { start: number; end: number; originalStart?: number };

interface Snapshot {
  /** Whose events these are: a tablet connected to another account never shows them. */
  household: string;
  calendars: CalendarInfo[];
  events: StoredEvent[];
  from: ISODate;
  to: ISODate;
  at: number;
  /** When each calendar's events were fetched; a calendar that never answered is missing. */
  syncedAt?: Record<string, number>;
}

/**
 * Keep the events for offline display. Notes take most of the room; when
 * the whole snapshot does not fit in storage the events are kept without
 * them, and when even that fails the last snapshot is removed: an old one
 * left in place would come back on the next offline start as if current.
 */
function saveSnapshot(household: string) {
  // A phone keeps the household's events in memory only (one left over from the wall layout goes).
  if (isPhone) return dropSnapshot();
  const stored = (withNotes: boolean): StoredEvent[] =>
    events.value.map((e) => ({
      ...e,
      description: withNotes ? e.description : undefined,
      start: e.start.getTime(),
      end: e.end.getTime(),
      originalStart: e.originalStart?.getTime(),
    }));
  const snapshot = (withNotes: boolean): Snapshot => ({
    household,
    calendars: calendars.value,
    events: stored(withNotes),
    from: loaded.peek()!.from,
    to: loaded.peek()!.to,
    at: Date.now(),
    syncedAt: Object.fromEntries(syncedAt),
  });
  for (const withNotes of [true, false]) {
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot(withNotes)));
      return;
    } catch {
      /* over the quota: try smaller */
    }
  }
  dropSnapshot();
}

/** Show the household's last events until the first sync; another household's are dropped. */
function loadSnapshot(household: string) {
  if (isPhone) return dropSnapshot();
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as Snapshot;
    if (s.household !== household) {
      localStorage.removeItem(SNAPSHOT_KEY);
      return;
    }
    calendars.value = s.calendars;
    // A calendar hidden since the snapshot was kept stays off.
    events.value = shownOnly(
      s.events.map((e) => ({
        ...e,
        start: new Date(e.start),
        end: new Date(e.end),
        originalStart: e.originalStart === undefined ? undefined : new Date(e.originalStart),
      })),
    );
    // A calendar missing from syncedAt never answered; a snapshot from before syncedAt was kept has only `at`.
    for (const c of s.calendars) {
      const at = s.syncedAt ? s.syncedAt[c.id] : s.at;
      if (at !== undefined) syncedAt.set(c.id, at);
    }
    loaded.value = { from: s.from, to: s.to };
    sync.value = { ...sync.value, lastSync: s.at };
  } catch {
    /* corrupt snapshot: ignore */
  }
}

const visibleCalendars = () => calendars.value.filter((c) => !settings.value.hiddenCalendars.includes(c.id));

/** The events of calendars not hidden in Settings (on any tablet). */
function shownOnly(evs: CalEvent[]): CalEvent[] {
  const hidden = settings.peek().hiddenCalendars;
  return evs.filter((e) => !hidden.includes(e.calendarId));
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- Rate limits ---------- */

/**
 * Google asked the wall to slow down. The background sync (polls, page
 * turns, coming back online or into view) holds off until `until`: a
 * minute, doubling with each limit in a row up to half an hour, or longer
 * when Google named a longer wait; one fetch runs when the pause ends.
 * Saves are not held back, and Google accepting one resumes the sync.
 */
const PAUSE_MIN_MS = 60_000;
const PAUSE_MAX_MS = 30 * 60_000;
let pause = { until: 0, step: 0 };
let resumeTimer: ReturnType<typeof setTimeout> | undefined;

function pauseSync(limit: RateLimited): void {
  const ms = Math.max(Math.min(PAUSE_MIN_MS * 2 ** pause.step, PAUSE_MAX_MS), limit.retryAfterMs ?? 0);
  pause = { until: Date.now() + ms, step: pause.step + 1 };
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => void refresh(), ms);
}

function endPause(): void {
  pause.until = 0;
  clearTimeout(resumeTimer);
}

/** No limit in force (Google answered without one, or another account connected): the backoff starts over. */
function clearPause(): void {
  endPause();
  pause.step = 0;
}

const limitIn = (reasons: unknown[]) => reasons.find((r): r is RateLimited => r instanceof RateLimited);

async function fetchAll(): Promise<void> {
  const household = householdId.peek();
  if (!household) return;
  // Results of a fetch that outlived its household (the tablet switched accounts) belong to no one on screen.
  const stale = () => householdId.peek() !== household;
  const w = fetchWindow();
  requested = w;
  sync.value = { ...sync.value, loading: true };
  try {
    const cals = await source.listCalendars();
    if (stale()) return;
    calendars.value = cals;
    const asked = visibleCalendars();
    const answers = await Promise.allSettled(asked.map((c) => source.listEvents(c.id, dateAt(w.from), dateAt(w.to))));
    if (stale()) return;
    const got = takeAnswers(asked, answers);
    if (got.answered.length || !got.shown.length) loaded.value = w;
    const far = await fetchFarCountdowns(new Set(got.answered.map((c) => c.id)));
    if (stale()) return;
    // Hidden while they were looked up: left off too.
    farCountdowns.value = shownOnly(far.found);
    const limit = limitIn([...got.errors, ...far.errors]);
    if (limit) pauseSync(limit);
    // A fetch Google answered without a limit ends the pause, one a fetch before it started included.
    else clearPause();
    sync.value = syncState(got);
    if (loaded.peek()) saveSnapshot(household);
  } catch (e) {
    if (stale()) return;
    if (e instanceof RateLimited) pauseSync(e);
    sync.value = { ...sync.value, loading: false, error: message(e), failing: failingNow(visibleCalendars()), partial: false };
  } finally {
    requested = null;
  }
}

/** What a fetch's calendars answered: the ones still shown, which of them answered and which failed (with why). */
interface Answers {
  shown: CalendarInfo[];
  answered: CalendarInfo[];
  failed: CalendarInfo[];
  errors: unknown[];
  at: number;
}

/**
 * Put a fetch's answers on the wall. A calendar that answered shows its new
 * events; one that failed keeps the events it had, so one bad calendar
 * neither blanks nor freezes the wall; one hidden while its events were on
 * the way stays off.
 */
function takeAnswers(asked: CalendarInfo[], answers: PromiseSettledResult<CalEvent[]>[]): Answers {
  const hidden = settings.peek().hiddenCalendars;
  const replies = asked.map((cal, i) => ({ cal, reply: answers[i] })).filter((r) => !hidden.includes(r.cal.id));
  const answered = replies.filter((r) => r.reply.status === 'fulfilled').map((r) => r.cal);
  const failed = replies.filter((r) => r.reply.status === 'rejected').map((r) => r.cal);
  const kept = events.value.filter((e) => failed.some((c) => c.id === e.calendarId));
  const fresh = replies.flatMap((r) => (r.reply.status === 'fulfilled' ? r.reply.value : []));
  events.value = [...kept, ...fresh].sort((a, b) => a.start.getTime() - b.start.getTime());
  const at = Date.now();
  answered.forEach((c) => syncedAt.set(c.id, at));
  return {
    shown: replies.map((r) => r.cal),
    answered,
    failed,
    errors: replies.flatMap((r) => (r.reply.status === 'rejected' ? [r.reply.reason] : [])),
    at,
  };
}

/** The sync state after a fetch: current, or which shown calendars did not answer and since when. */
function syncState(got: Answers): SyncState {
  if (!got.failed.length) return { loading: false, lastSync: got.at, error: null, failing: [], partial: false };
  return {
    loading: false,
    lastSync: sync.value.lastSync,
    error: `${got.failed[0].name}: ${message(got.errors[0])}`,
    failing: failingNow(got.failed),
    partial: got.failed.length < got.shown.length,
  };
}

const failingNow = (cals: CalendarInfo[]) => cals.map((c) => ({ name: c.name, at: syncedAt.get(c.id) ?? null }));

/** Forget everything shown for the last household, so the next one starts from its own. */
function resetForHousehold(household: string | null): void {
  signalBatch(() => {
    calendars.value = [];
    events.value = [];
    farCountdowns.value = [];
    sync.value = { loading: false, lastSync: null, error: null, failing: [], partial: false };
  });
  farCache.clear();
  syncedAt.clear();
  // Rate limits are per Google account.
  clearPause();
  loaded.value = null;
  if (household) loadSnapshot(household);
  // Signed out (disconnected, or a phone removed or unpaired): its events leave the device too.
  else dropSnapshot();
}

function dropSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* storage unavailable: nothing was kept */
  }
}

let running: Promise<void> | null = null;
let queued: Promise<void> | null = null;
/** The queued fetch is one a person waits for (syncNow): a pause the running fetch starts does not skip it. */
let queuedForced = false;

/**
 * Re-fetch every shown calendar. A call made while a fetch is running gets
 * one more fetch after it (shared by every such call), so what it awaits
 * includes any change made before the call: a saved event, a wider window.
 * While the sync is paused for a rate limit it does nothing; the fetch at
 * the end of the pause covers it.
 */
export const refresh = (): Promise<void> => fetchSoon(false);

/** Fetch now even while the sync is paused: a person asked (Sync now), or Google just accepted their save. */
export function syncNow(): Promise<void> {
  endPause();
  return fetchSoon(true);
}

/** refresh(), or with `force` syncNow(): a pause started meanwhile (by the fetch running now) does not skip it. */
function fetchSoon(force: boolean): Promise<void> {
  if (!force && Date.now() < pause.until) return Promise.resolve();
  if (!running) {
    running = fetchAll().finally(() => (running = null));
    return running;
  }
  if (force) queuedForced = true;
  queued ??= running.then(() => {
    const forced = queuedForced;
    queued = null;
    queuedForced = false;
    return fetchSoon(forced);
  });
  return queued;
}

/**
 * Make sure [from, to] is loaded: a view calls this for the days it shows,
 * and the release it returns once it stops showing them (an effect's
 * cleanup: it pages on or unmounts), so the window narrows back. Days the
 * fetch under way does not ask for (or, between fetches, outside the loaded
 * window) are fetched.
 */
export function ensureRange(from: ISODate, to: ISODate): () => void {
  const ask = { from, to };
  wanted = ask;
  const w = requested ?? loaded.peek();
  if (!w || from < w.from || to >= w.to) void refresh();
  return () => {
    if (wanted === ask) wanted = null;
  };
}

let started = false;
const POLL_MS = 3 * 60_000;

export function startCalendarSync(): void {
  if (started) return;
  started = true;
  let household = householdId.peek();
  if (household) loadSnapshot(household);
  void refresh();
  // Another account connected on this tablet (or none): drop the last one's events and fetch the new one's.
  effect(() => {
    const next = householdId.value;
    if (next === household) return;
    household = next;
    resetForHousehold(next);
    if (next) void refresh();
  });
  setInterval(() => void refresh(), POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  window.addEventListener('online', () => void refresh());
  // Switching to Always needs the countdowns past the window.
  let win = settings.peek().countdownWindow;
  effect(() => {
    const next = settings.value.countdownWindow;
    if (next !== win && next === 'always') void refresh();
    win = next;
  });
  // A calendar hidden on any tablet leaves the wall at once; one shown again is fetched.
  let hidden = settings.peek().hiddenCalendars;
  effect(() => {
    const next = settings.value.hiddenCalendars;
    if (sameIds(next, hidden)) return;
    const shownAgain = hidden.some((id) => !next.includes(id));
    hidden = next;
    signalBatch(() => {
      events.value = shownOnly(events.peek());
      farCountdowns.value = shownOnly(farCountdowns.peek());
    });
    if (shownAgain) void refresh();
  });
}

/* ---------- Event metadata (profiles, countdowns) ---------- */

/** EventMeta document id for an event or a series. */
export const metaKey = (calendarId: string, id: string) => encodeURIComponent(eventKey(calendarId, id));

const metaById = computed(() => new Map(data.eventMeta.value.map((m) => [m.id, m])));

/** The event's own meta document (its instance key) and its series' document. */
function metaDocs(ev: CalEvent): { own?: EventMeta; series?: EventMeta; ownKey: string; seriesKey: string | null } {
  const m = metaById.value;
  const ownKey = metaKey(ev.calendarId, ev.id);
  const seriesKey = ev.seriesId ? metaKey(ev.calendarId, ev.seriesId) : null;
  return { own: m.get(ownKey), series: seriesKey ? m.get(seriesKey) : undefined, ownKey, seriesKey };
}

/**
 * The event's meta: series-level fields, overridden field by field by the
 * occurrence's own document. An occurrence document overrides profiles only
 * when it lists some (empty = inherit), and countdown/emoji only when set.
 */
export function metaFor(ev: CalEvent): EventMeta | undefined {
  const { own, series } = metaDocs(ev);
  if (!own || !series) return own ?? series;
  return {
    ...series,
    id: own.id,
    updatedAt: own.updatedAt,
    profiles: own.profiles.length ? own.profiles : series.profiles,
    ...(own.countdown != null && { countdown: own.countdown }),
    ...(own.emoji != null && { emoji: own.emoji }),
  };
}

/**
 * Assigned profile ids ([EVERYONE] for the family), or null when unassigned.
 * A holiday is the family's until assigned otherwise, or marked no one's
 * (NOBODY: the one person it was given to was deleted).
 */
export function profilesOf(ev: CalEvent): string[] | null {
  const meta = metaFor(ev);
  const known = profileById.value;
  const ids = meta?.profiles.filter((p) => p === EVERYONE || known.has(p)) ?? [];
  if (ids.length) return ids;
  return isHolidayCalendar(ev.calendarId) && !meta?.profiles.includes(NOBODY) ? [EVERYONE] : null;
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

/**
 * Is the event shown while the profiles in `hidden` are filtered out? While
 * any of its profiles is shown, and always when it is for the whole family
 * or unassigned.
 */
export function passesHidden(ev: CalEvent, hidden: readonly string[]): boolean {
  if (!hidden.length) return true;
  const ids = profilesOf(ev);
  if (!ids || ids.includes(EVERYONE)) return true;
  return ids.some((id) => !hidden.includes(id));
}

/** Is the event shown under the household's calendar filter (the wall's)? */
export const passesFilter = (ev: CalEvent): boolean => passesHidden(ev, settings.value.filter.hiddenProfiles);

/**
 * Events overlapping [from, to] (inclusive ISO dates) that pass the filter
 * hiding `hidden` (passesHidden): the household's, unless a view has its own
 * (the phone's people filter).
 */
export function eventsBetween(
  from: ISODate,
  to: ISODate,
  hidden: readonly string[] = settings.value.filter.hiddenProfiles,
): CalEvent[] {
  const a = dateAt(from).getTime();
  const b = dateAt(addDays(to, 1)).getTime();
  return events.value.filter((e) => endMs(e) > a && e.start.getTime() < b && passesHidden(e, hidden));
}

/** Events on one day, all-day first, then by start, filtered as eventsBetween is. */
export function eventsOn(day: ISODate, hidden?: readonly string[]): CalEvent[] {
  return eventsBetween(day, day, hidden).sort(
    (x, y) => Number(y.allDay) - Number(x.allDay) || x.start.getTime() - y.start.getTime(),
  );
}

/**
 * Triage queue: upcoming events nobody is assigned to, one row per series
 * (its next unassigned occurrence), soonest first.
 */
export const unassigned = computed(() => {
  void data.eventMeta.value;
  void profileById.value;
  const from = dateAt(today.value).getTime();
  const seen = new Set<string>();
  const out: CalEvent[] = [];
  for (const ev of events.value) {
    if (endMs(ev) <= from || settings.value.hiddenCalendars.includes(ev.calendarId) || profilesOf(ev)) continue;
    const series = seriesOf(ev);
    if (seen.has(series)) continue;
    seen.add(series);
    out.push(ev);
  }
  return out;
});

/**
 * How the triage queue assigns an event: for the whole series, unless the
 * series has people and only this occurrence has no one (its own document
 * says NOBODY), when this occurrence alone.
 */
export function triageScope(ev: CalEvent): 'series' | 'instance' {
  const series = metaDocs(ev).series;
  const known = profileById.value;
  return series?.profiles.some((p) => p === EVERYONE || known.has(p)) ? 'instance' : 'series';
}

type MetaFields = Partial<Pick<EventMeta, 'profiles' | 'countdown' | 'emoji'>>;

/**
 * Write `fields` (undefined clears one) into a meta document, creating it
 * when there is none. Only those fields are written, so a change another
 * device made to the others (an assignment, a countdown) is kept. A write
 * without profiles adds none (arrayUnion of nothing): the list it creates
 * where there is none leaves one another device wrote meanwhile alone.
 */
function writeMeta(id: string, fields: MetaFields): void {
  void upsert('eventMeta', id, {
    ...(fields.profiles ? {} : { profiles: listAdd<string>() }),
    ...fields,
    id,
    updatedAt: currentTime(),
  });
}

/**
 * Write the occurrence's own document with `fields` changed (undefined
 * clears a field). A document left with nothing of its own is removed, so
 * the occurrence follows its series again.
 */
function putOwn(ev: CalEvent, fields: MetaFields): void {
  const { own, ownKey } = metaDocs(ev);
  const next: EventMeta = { profiles: [], ...own, ...fields, id: ownKey, updatedAt: currentTime() };
  if (!next.profiles.length && next.countdown == null && next.emoji == null) {
    if (own) void removeDoc('eventMeta', ownKey);
    return;
  }
  writeMeta(ownKey, fields);
}

/** Write the series document (or the event's own one, for a one-off event) with `fields` changed. */
function putSeries(ev: CalEvent, fields: MetaFields): void {
  const { ownKey, seriesKey } = metaDocs(ev);
  writeMeta(seriesKey ?? ownKey, fields);
}

/**
 * No one chosen is written as [NOBODY]: an empty list would read as
 * following the series on an occurrence, and as the family's on a holiday.
 */
const orNobody = (ids: string[]) => (ids.length ? ids : [NOBODY]);

/**
 * Assign profiles (none: back in the triage queue). 'series' writes the
 * series-level entry (and drops this occurrence's own profiles);
 * 'instance' overrides one occurrence's profiles.
 */
export function assign(ev: CalEvent, profileIds: string[], scope: 'series' | 'instance' = 'series'): void {
  const profiles = orNobody(profileIds);
  if (!ev.seriesId) return putSeries(ev, { profiles });
  if (scope === 'instance') return putOwn(ev, { profiles });
  putSeries(ev, { profiles });
  if (metaDocs(ev).own) putOwn(ev, { profiles: [] });
}

/** Countdowns are per series: the series flag changes and this occurrence's own flag is dropped. */
export function setCountdown(ev: CalEvent, on: boolean): void {
  putSeries(ev, { countdown: on });
  if (ev.seriesId && metaDocs(ev).own?.countdown != null) putOwn(ev, { countdown: undefined });
}

/**
 * Countdown events past the fetched window, fetched one by one: with the
 * Always setting a countdown months ahead (a summer trip) still shows.
 * When Google says an event has nothing left to count down to (deleted,
 * declined, over), its countdown is turned off, so no tablet asks again.
 */
const farCountdowns = signal<CalEvent[]>([]);
/** Next occurrence per countdown meta id, re-checked hourly rather than on every poll. */
const farCache = new Map<string, { at: number; ev: CalEvent }>();
const FAR_TTL_MS = 60 * 60_000;

/**
 * The countdown events past the window, for fetchAll to show, and why any
 * of them could not be asked. Only calendars that answered this fetch
 * (`answered`) are asked: a failing one's "none" could mean it is unreadable.
 */
async function fetchFarCountdowns(answered: Set<string>): Promise<{ found: CalEvent[]; errors: unknown[] }> {
  if (settings.value.countdownWindow !== 'always') return { found: [], errors: [] };
  const shown = new Set(visibleCalendars().map((c) => c.id));
  // Only what the window holds from today on, as countdownsFor counts: a series whose occurrence in the window is
  // over (a birthday last month) is asked for its next one.
  const t0 = today.value;
  const inWindow = new Set(
    events.value
      .filter((e) => toISODate(e.start) >= t0)
      .flatMap((e) => [metaKey(e.calendarId, e.id), metaKey(e.calendarId, e.seriesId ?? e.id)]),
  );
  const lookups = data.eventMeta.value
    .filter((m) => m.countdown && !inWindow.has(m.id))
    .map((m) => {
      const key = decodeURIComponent(m.id);
      const at = key.lastIndexOf('::');
      return { metaId: m.id, calendarId: key.slice(0, at), id: key.slice(at + 2) };
    })
    .filter((k) => shown.has(k.calendarId));
  const now = currentTime();
  const after = dateAt(t0);
  const stale = lookups.filter(
    (k) => answered.has(k.calendarId) && (farCache.get(k.metaId)?.at ?? -Infinity) <= now - FAR_TTL_MS,
  );
  const found = await Promise.allSettled(stale.map((k) => source.nextOccurrence(k.calendarId, k.id, after)));
  found.forEach((r, i) => {
    if (r.status !== 'fulfilled') return;
    const { metaId } = stale[i];
    if (r.value) return void farCache.set(metaId, { at: now, ev: r.value });
    farCache.delete(metaId);
    // updateDoc, not a merge: a document deleted meanwhile is not brought back.
    void patch('eventMeta', metaId, { countdown: false, updatedAt: now }).catch(() => {});
  });
  return {
    found: lookups.flatMap((k) => farCache.get(k.metaId)?.ev ?? []),
    errors: found.flatMap((r) => (r.status === 'rejected' ? [r.reason] : [])),
  };
}

/**
 * Countdown events within the configured window, soonest first, one per
 * series, of the events that pass the filter hiding `hidden`
 * (passesHidden). Read inside a render or computed, it follows the signals
 * it reads.
 */
export function countdownsFor(hidden: readonly string[]): { ev: CalEvent; days: number }[] {
  void data.eventMeta.value;
  const t0 = today.value;
  const win = settings.value.countdownWindow;
  const horizon = win === 'always' ? '9999-12-31' : addMonths(t0, win === '3m' ? 3 : 1);
  const seen = new Set<string>();
  const out: { ev: CalEvent; days: number }[] = [];
  for (const ev of [...events.value, ...farCountdowns.value]) {
    const day = toISODate(ev.start);
    if (day < t0 || day > horizon || !passesHidden(ev, hidden)) continue;
    const series = seriesOf(ev);
    if (seen.has(series) || !metaFor(ev)?.countdown) continue;
    seen.add(series);
    out.push({ ev, days: diffDays(t0, day) });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** The wall's countdowns: under the household's filter. */
export const countdowns = computed(() => countdownsFor(settings.value.filter.hiddenProfiles));

/* ---------- Writes ---------- */

export const writableCalendars = computed(() =>
  calendars.value.filter((c) => c.accessRole === 'owner' || c.accessRole === 'writer'),
);

export function defaultCalendarId(): string {
  const w = writableCalendars.value;
  const chosen = settings.value.defaultCalendarId;
  return (w.find((c) => c.id === chosen) ?? w.find((c) => c.primary) ?? w[0])?.id ?? '';
}

/**
 * Calendars a save of each new event id went to without an answer. The
 * request may have landed, so a retry to another calendar (the parent
 * picked a different one) moves the event from there.
 */
const triedIn = new Map<string, Set<string>>();

/** Add an event; `id` comes from newEventId() once per editor, so retrying a failed save is safe. */
export async function createEvent(
  calendarId: string,
  id: string,
  draft: EventDraft,
  profileIds: string[],
  opts: { countdown?: boolean } = {},
): Promise<void> {
  const tried = triedIn.get(id) ?? new Set<string>();
  const earlier = [...tried];
  tried.add(calendarId);
  triedIn.set(id, tried);
  await source.insert(calendarId, id, draft, earlier);
  triedIn.delete(id);
  // Firestore writes apply to the local cache at once; awaiting the server ack would hang offline.
  void put('eventMeta', {
    id: metaKey(calendarId, id),
    profiles: profileIds,
    countdown: opts.countdown,
    updatedAt: currentTime(),
  });
  await syncNow();
}

/** What the editor changed of who an event is for and its countdown; a field left out was not changed. */
export type MetaChanges = Pick<MetaFields, 'profiles' | 'countdown'>;

/**
 * Save an edited event. Only the meta `changes` names is written, so an
 * assignment or countdown another device changed since the editor opened
 * is kept.
 */
export async function updateEvent(ev: CalEvent, draft: EventDraft, scope: EditScope, changes: MetaChanges): Promise<void> {
  const { newSeriesId } = await source.update(ev, draft, scope);
  const { profiles, countdown } = changes;
  if (newSeriesId) {
    // The new series starts out as the edited occurrence looks, with the editor's changes.
    const shown = metaFor(ev);
    void put('eventMeta', {
      id: metaKey(ev.calendarId, newSeriesId),
      profiles: profiles ?? profilesOf(ev) ?? [],
      countdown: countdown ?? !!shown?.countdown,
      emoji: shown?.emoji,
      updatedAt: currentTime(),
    });
  } else if (ev.seriesId && scope === 'this') {
    // The occurrence keeps only what differs from its series.
    const series = metaDocs(ev).series;
    const own: MetaFields = {};
    if (profiles) own.profiles = sameIds(profiles, series?.profiles ?? []) ? [] : profiles;
    if (countdown !== undefined) own.countdown = countdown === !!series?.countdown ? undefined : countdown;
    if (Object.keys(own).length) putOwn(ev, own);
  } else if (profiles || countdown !== undefined) {
    putSeries(ev, changes);
    // "All events" applies to this occurrence too: its own value of what changed goes.
    if (ev.seriesId && metaDocs(ev).own)
      putOwn(ev, { ...(profiles && { profiles: [] }), ...(countdown !== undefined && { countdown: undefined }) });
  }
  await syncNow();
}

export async function deleteEvent(ev: CalEvent, scope: EditScope): Promise<void> {
  await source.remove(ev, scope);
  const { own, ownKey, seriesKey } = metaDocs(ev);
  if (!seriesKey || scope === 'all') void removeDoc('eventMeta', seriesKey ?? ownKey).catch(() => {});
  if (seriesKey && own) void removeDoc('eventMeta', ownKey).catch(() => {});
  await syncNow();
}

/** The series' recurrence lines (RRULE, EXDATE), for the editor and the event's details; none for a one-off event. */
export async function seriesRecurrence(ev: CalEvent): Promise<string[]> {
  return ev.seriesId ? source.seriesRecurrence(ev.calendarId, ev.seriesId) : [];
}

/** Days until a date from today (negative in the past). */
export const daysUntil = (day: ISODate) => diffDays(today.value, day);
