import { batch, computed, signal } from '@preact/signals';
import { deleteField } from 'firebase/firestore';
import { prayerSettingsDoc, settings as household } from '../data/store';
import { currentTime } from '../lib/clock';
import { addDays, toISODate } from '../lib/date';
import { now, previewing, travelTo } from './core/clock';
import { bundledPhoto, defaultIds, photoForDay, rotation, upcoming } from './core/library';
import {
  deleteUpload,
  listUploads,
  loadBundledAudio,
  loadCalligraphyArt,
  loadGallery,
  MEDIA,
  newId,
  processImage,
  putUpload,
  type AudioUpload,
  type BundledAudio,
  type CalligraphyArt,
  type GalleryItem,
  type ImageUpload,
  type Photo,
  type Upload,
} from './core/media';
import { placeDay, type DayTimes } from './core/prayer';
import {
  calligraphyWindowId,
  clockState,
  computeDays,
  periodMoment,
  SLOT_PERIOD,
  type AthanLength,
  type ClockState,
  type Days,
} from './core/schedule';
import { BG_SLOTS, DEFAULT_SETTINGS, PRAYERS, type BgSlot, type Settings, type PrayerKey, type ThemeKey } from './core/settings';
import { previewEnd } from './rules';
import { savePrayer, settings, updateSettings } from './settingsStore';

export { settings, updateSettings };

/** The household's place (Settings > Location), which the prayer times are for. */
export const place = computed(() => household.value.place);

/** Virtual time, advanced once per displayed second. */
export const tick = signal<Date>(now());
let lastSecond = Math.floor(tick.value.getTime() / 1000);
setInterval(() => {
  if (previewing.peek() && currentTime() >= previewEndsAt) endPreview();
  const n = now();
  const sec = Math.floor(n.getTime() / 1000);
  if (sec !== lastSecond) {
    lastSecond = sec;
    tick.value = n;
  }
}, 200);

export const bundledAudio = signal<BundledAudio[]>([]);
const gallery = signal<GalleryItem[]>([]);
export const calligraphyArt = signal<CalligraphyArt[]>([]);
export const uploads = signal<Upload[]>([]);
const DISMISSED_KEY = 'manwar.prayer.dismissed.v1';

/**
 * What was closed, kept across a reload so a background update can't bring
 * back an athan the user stopped. Ids start with their day; only yesterday's
 * and later matter, so older ones are dropped as new ones come.
 */
const recent = (ids: Iterable<string>, at: Date): Set<string> => {
  const since = addDays(toISODate(at), -1);
  return new Set([...ids].filter((id) => id >= since));
};

function loadDismissed(): ReadonlySet<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return recent(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [], now());
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Not kept across a reload; nothing else depends on it.
  }
}

const dismissed = signal<ReadonlySet<string>>(loadDismissed());
export const settingsOpen = signal(false);
/** Forces a theme while a settings preview is running. */
export const previewTheme = signal<ThemeKey | null>(null);

/** Something the showcase can put full screen. */
export type ViewItem =
  | { kind: 'theme'; theme: ThemeKey; label: string }
  | { kind: 'background'; photo: Photo; slot: BgSlot }
  | { kind: 'photo'; photo: Photo }
  | { kind: 'art'; art: CalligraphyArt };

/** The showcase viewer: a list being browsed full screen, or null. */
export const viewer = signal<{ items: ViewItem[]; index: number } | null>(null);
/** The slot whose background picker is open, or null. */
export const picking = signal<BgSlot | null>(null);
export const audioBlocked = signal(false);

/** True once the first attempt to load the media indexes and uploads has finished, whatever its outcome. */
const mediaLoaded = signal(false);

/** Loads the media indexes and uploads; anything that failed is tried again a minute later. */
export async function loadMedia(): Promise<void> {
  const [audio, ups, gal, art] = await Promise.allSettled([
    loadBundledAudio(),
    listUploads(),
    loadGallery(),
    loadCalligraphyArt(),
  ]);
  if (art.status === 'fulfilled') calligraphyArt.value = art.value;
  if (gal.status === 'fulfilled') gallery.value = gal.value;
  if (audio.status === 'fulfilled') bundledAudio.value = audio.value;
  // A recording this tablet does not have (chosen on another tablet, or its storage cleared) is not
  // written out of the household's settings: recordingFor plays the default athan in its place.
  if (ups.status === 'fulfilled') {
    uploads.value = ups.value;
    listRecordings(ups.value.flatMap((u) => (u.kind === 'audio' ? [u] : [])));
  }
  mediaLoaded.value = true;
  if ([audio, ups, gal, art].some((r) => r.status === 'rejected')) setTimeout(() => void loadMedia(), 60_000);
  else setTimeout(() => void warmMedia(), WARM_AFTER_MS);
}

/** The background fetch of the bundled media waits this long after the page opens, so it never slows the start. */
const WARM_AFTER_MS = 60_000;
let warming = false;

/**
 * Fetch, one at a time, the bundled media this tablet has not cached yet:
 * the service worker caches each (vite.config.ts), so photos and every
 * athan are there through a Wi-Fi drop. Only once the clock has a place
 * (a household that does not use it downloads nothing) and a service worker
 * controls the page (the first visit's fetches would not be cached).
 */
async function warmMedia(): Promise<void> {
  if (warming || !place.peek() || !('caches' in window) || !navigator.serviceWorker?.controller) {
    if (!warming) setTimeout(() => void warmMedia(), WARM_AFTER_MS * 10);
    return;
  }
  warming = true;
  const urls = [
    ...bundledAudio.peek().map((a) => `${MEDIA}/audio/${a.file}`),
    ...gallery.peek().flatMap((g) => [`${MEDIA}/gallery/${g.file}`, `${MEDIA}/gallery/${g.fileSm}`]),
    ...calligraphyArt.peek().map((c) => `${MEDIA}/calligraphy/${c.file}`),
    `${MEDIA}/art/rays.webp`,
  ];
  try {
    // Media of an earlier version (vite.config.ts names the cache by the media's content) goes.
    const current = import.meta.env.VITE_PRAYER_MEDIA_CACHE as string;
    for (const k of await caches.keys()) if (k.startsWith('prayer-media') && k !== current) await caches.delete(k);
    const cache = await caches.open(current);
    for (const url of urls) {
      if (await cache.match(url)) continue;
      const r = await fetch(url);
      if (r.ok) await r.blob();
    }
  } catch {
    // Offline or a failed file: try again later; what was fetched stays cached.
    setTimeout(() => void warmMedia(), WARM_AFTER_MS * 10);
  } finally {
    warming = false;
  }
}

/** The athans that played the recording `ref` (an upload deleted here) go back to their defaults. */
function resetSoundsUsing(ref: string): void {
  const s = settings.peek();
  if (!PRAYERS.some((p) => s.sounds[p].audioId === ref) && s.tahajjud.audioId !== ref) return;
  updateSettings((x) => ({
    sounds: Object.fromEntries(
      PRAYERS.map((p) => [
        p,
        x.sounds[p].audioId === ref ? { ...x.sounds[p], audioId: DEFAULT_SETTINGS.sounds[p].audioId } : x.sounds[p],
      ]),
    ) as Settings['sounds'],
    tahajjud: x.tahajjud.audioId === ref ? { ...x.tahajjud, audioId: DEFAULT_SETTINGS.tahajjud.audioId } : x.tahajjud,
  }));
}

export function dismiss(id: string): void {
  dismissed.value = recent([...dismissed.value, id], now());
  // A preview's dismissals are its own and end with it.
  if (!liveDismissed) saveDismissed(dismissed.value);
}

/** The real clock's dismissals, set aside while a preview keeps its own. */
let liveDismissed: ReadonlySet<string> | null = null;
/** When the running preview ends itself (rules.ts `previewEnd`), on the real clock. */
let previewEndsAt = 0;

/**
 * Moves the clock and the state derived from it in one step: effects never
 * see a preview's time as wall time or the reverse (the audio controller
 * would mark a real athan as played).
 */
function travel(at: Date | null, theme: ThemeKey | null, ids: ReadonlySet<string>): void {
  batch(() => {
    travelTo(at);
    tick.value = now();
    previewTheme.value = theme;
    dismissed.value = ids;
  });
}

/** The clock at the real time (also while a preview has moved `clock`), or null before the household has a place. */
function realClock(): ClockState | null {
  const p = place.peek();
  if (!p) return null;
  const at = new Date(currentTime());
  const s = settings.peek();
  return clockState(at, computeDays(at, p, s), s, athanLength.peek(), liveDismissed ?? dismissed.peek());
}

/**
 * Moves the clock to a preview moment, where nothing has been dismissed
 * yet, until the preview's end (rules.ts `previewEnd`: before the real
 * clock's next takeover). False when no preview may start: the real athan
 * sequence is on, or about to be.
 */
export function startPreview(at: Date, theme: ThemeKey | null): boolean {
  const real = realClock();
  const end = real && previewEnd(real);
  if (!end) return false;
  previewEndsAt = end;
  liveDismissed ??= dismissed.value;
  travel(at, theme, new Set());
  return true;
}

/** Why no preview can start now, or null (the settings panel says it). */
export function previewRefusal(): string | null {
  const real = realClock();
  if (!real || previewEnd(real)) return null;
  return real.takeover
    ? 'Previews wait until the athan sequence ends.'
    : 'The athan sequence starts in a minute; previews wait until it ends.';
}

/** Returns to the real clock and what was dismissed there. */
export function endPreview(): void {
  travel(null, null, liveDismissed ?? dismissed.value);
  liveDismissed = null;
}

/** Sets the daytime theme and shows it now: a calligraphy window in progress ends early. */
export function setDayTheme(dayTheme: Settings['dayTheme']): void {
  dismiss(calligraphyWindowId(clock.value!.current));
  updateSettings(() => ({ dayTheme }));
}

// --- Derived clock state ----------------------------------------------------

let daysCache: { key: string; days: Days } | null = null;

const days = computed<Days | null>(() => {
  const p = place.value;
  if (!p) return null;
  const s = settings.value;
  const key = JSON.stringify([placeDay(tick.value, p.timezone).getTime(), p, s.method, s.madhab, s.highLatRule, s.adjust]);
  if (daysCache?.key !== key) daysCache = { key, days: computeDays(tick.value, p, s) };
  return daysCache.days;
});

/** Object URLs of this tablet's uploads (their files and photo thumbnails), by upload id; revoked when the upload is deleted. */
const uploadUrls = new Map<string, string>();
const thumbUrls = new Map<string, string>();

function objectUrl(urls: Map<string, string>, id: string, blob: Blob): string {
  let url = urls.get(id);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(id, url);
  }
  return url;
}

const uploadUrl = (u: Upload): string => objectUrl(uploadUrls, u.id, u.blob);

function revokeUrls(id: string): void {
  for (const urls of [uploadUrls, thumbUrls]) {
    const url = urls.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(id);
  }
}

/** Resolves an audio id (bundled or `upload:<id>`) to a playable URL and length. */
export function resolveAudio(audioId: string): { url: string; durationSec: number } | null {
  if (audioId.startsWith('upload:')) {
    const u = uploads.value.find((x) => x.id === audioId.slice(7));
    return u?.kind === 'audio' ? { url: uploadUrl(u), durationSec: u.durationSec } : null;
  }
  const b = bundledAudio.value.find((x) => x.id === audioId);
  return b ? { url: `${MEDIA}/audio/${b.file}`, durationSec: b.durationSec } : null;
}

/**
 * The recording an athan plays: the chosen one, or the default athan when
 * the chosen upload can't be read once loading has finished.
 */
export function recordingFor(kind: PrayerKey | 'tahajjud'): { url: string; durationSec: number } | null {
  const s = settings.value;
  const [choice, fallback] =
    kind === 'tahajjud' ? [s.tahajjud, DEFAULT_SETTINGS.tahajjud] : [s.sounds[kind], DEFAULT_SETTINGS.sounds[kind]];
  return resolveAudio(choice.audioId) ?? (mediaLoaded.value ? resolveAudio(fallback.audioId) : null);
}

const athanLength = computed<AthanLength>(() => {
  const s = settings.value;
  // Touch the media signals so lengths update once indexes load.
  void bundledAudio.value;
  void uploads.value;
  void mediaLoaded.value;
  return (p) => {
    const choice = p === 'tahajjud' ? s.tahajjud : s.sounds[p];
    if (!choice.enabled) return null;
    return recordingFor(p)?.durationSec ?? 0;
  };
});

export const clock = computed<ClockState | null>(() => {
  const d = days.value;
  if (!d) return null;
  return clockState(tick.value, d, settings.value, athanLength.value, dismissed.value);
});

/** The clock a little way into a slot's part of the day, as the calligraphy theme would show it then (the clock has a place). */
export function clockInSlot(slot: BgSlot, today: DayTimes): ClockState {
  const s = settings.value;
  const at = periodMoment(today, SLOT_PERIOD[slot]);
  return clockState(at, computeDays(at, place.value!, s), s, athanLength.value);
}

// --- Photo library and backgrounds -------------------------------------------

function uploadPhoto(u: ImageUpload): Photo {
  return {
    id: `upload:${u.id}`,
    url: uploadUrl(u),
    thumb: objectUrl(thumbUrls, u.id, u.thumb),
    category: 'uploads',
    title: u.name,
    subtitle: '',
    fit: u.fit,
    tones: u.tones,
  };
}

/** Every photo: bundled, then the user's uploads. */
export const photos = computed<Photo[]>(() => [
  ...gallery.value.map(bundledPhoto),
  ...uploads.value.flatMap((u) => (u.kind === 'image' ? [uploadPhoto(u)] : [])),
]);

const photoById = computed(() => new Map(photos.value.map((p) => [p.id, p])));

export const defaultBackgrounds = (slot: BgSlot): string[] => defaultIds(gallery.value, slot);

/** The photos a slot rotates through, in order. */
export function backgroundsFor(slot: BgSlot): Photo[] {
  return rotation(settings.value.backgrounds[slot], defaultBackgrounds(slot), photoById.value);
}

/** The slot's photo for the day. */
export function backgroundFor(slot: BgSlot, day: Date): Photo | null {
  return photoForDay(backgroundsFor(slot), day, slot);
}

/** The slot's rotation in the order it will show, starting with the day's photo. */
export const upcomingBackgrounds = (slot: BgSlot, day: Date): Photo[] => upcoming(backgroundsFor(slot), day, slot);

/** The photos chosen for a slot (its suggestions until the user chooses); none shows the suggestions. */
export function chosenBackgrounds(slot: BgSlot): string[] {
  const choice = settings.value.backgrounds[slot];
  if (choice === 'all') return photos.value.map((p) => p.id);
  return (choice ?? defaultBackgrounds(slot)).filter((id) => photoById.value.has(id));
}

/** Stores a slot's photos. Every photo in the library becomes 'all', so photos added later join too. */
function chooseBackgrounds(slot: BgSlot, ids: string[]): void {
  const chosen = new Set(ids);
  const choice = ids.length && photos.value.every((p) => chosen.has(p.id)) ? 'all' : ids;
  updateSettings((s) => ({ backgrounds: { ...s.backgrounds, [slot]: choice } }));
}

/** Adds a photo to a slot's choice, or takes it out. */
export function toggleBackground(slot: BgSlot, id: string): void {
  const ids = chosenBackgrounds(slot);
  chooseBackgrounds(slot, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
}

/** Adds a group of photos to a slot's choice, or takes them all out. */
export function setBackgrounds(slot: BgSlot, ids: string[], on: boolean): void {
  const current = chosenBackgrounds(slot);
  const group = new Set(ids);
  chooseBackgrounds(slot, on ? [...new Set([...current, ...ids])] : current.filter((x) => !group.has(x)));
}

export function resetBackgrounds(slot: BgSlot): void {
  updateSettings((s) => ({ backgrounds: { ...s.backgrounds, [slot]: null } }));
}

export async function addUpload<U extends Upload>(u: Omit<U, 'id'>): Promise<U> {
  const full = { ...u, id: newId() } as U;
  await putUpload(full);
  uploads.value = [...uploads.value, full];
  if (full.kind === 'audio') listRecordings([full]);
  return full;
}

/**
 * Name this tablet's uploaded recordings in the household's prayer
 * settings (`recordings`: prayer/recordings.ts), so a phone can choose
 * them. Only the ones not listed yet; another tablet's stay.
 */
function listRecordings(audio: readonly AudioUpload[]): void {
  const listed = (prayerSettingsDoc.peek().recordings ?? {}) as Record<string, unknown>;
  const missing = audio.filter((u) => !(u.id in listed));
  if (!missing.length) return;
  savePrayer({ recordings: Object.fromEntries(missing.map((u) => [u.id, { name: u.name, durationSec: u.durationSec }])) });
}

const photoName = (file: string) =>
  file
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 48) || 'Photo';

/** Adds photos to the library: the ids of those added, and the names of files that could not be. */
export async function uploadPhotos(files: File[]): Promise<{ ids: string[]; failed: string[] }> {
  const ids: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      const img = await processImage(file);
      const u = await addUpload<ImageUpload>({ kind: 'image', name: photoName(file.name), ...img });
      ids.push(`upload:${u.id}`);
    } catch {
      failed.push(file.name);
    }
  }
  return { ids, failed };
}

/** Deletes an upload and every reference to it. */
export async function removeUpload(id: string): Promise<void> {
  await deleteUpload(id);
  revokeUrls(id);
  uploads.value = uploads.value.filter((u) => u.id !== id);
  const ref = `upload:${id}`;
  resetSoundsUsing(ref);
  savePrayer({ recordings: { [id]: deleteField() } });
  updateSettings((x) => ({
    backgrounds: Object.fromEntries(
      BG_SLOTS.map((slot) => {
        const choice = x.backgrounds[slot];
        return [slot, Array.isArray(choice) ? choice.filter((i) => i !== ref) : choice];
      }),
    ) as Settings['backgrounds'],
  }));
}
