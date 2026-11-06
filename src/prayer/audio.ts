import { effect, signal } from '@preact/signals';
import { addDays, toISODate } from '../lib/date';
import { previewRun } from './core/clock';
import { PRAYERS } from './core/settings';
import { audioBlocked, clock, recordingFor, resolveAudio, settings, tick } from './store';

const athanEl = new Audio();
athanEl.preload = 'auto';
const chimeEl = new Audio();
chimeEl.preload = 'auto';

let playingId: string | null = null;

/**
 * True while an athan sounds (a moment preview's too; not a recording tried
 * in the settings): the wall holds its own sounds (a timer's alarm, a note's
 * chime) until it ends (core/sound.ts). Set when an athan's play() goes
 * through (also over a tried recording, which sends no new 'playing'),
 * cleared when it stops.
 */
export const athanSounding = signal(false);
for (const ev of ['pause', 'ended', 'emptied'] as const) athanEl.addEventListener(ev, () => (athanSounding.value = false));

/** A sound the browser blocked (autoplay) and the tap that unblocks it plays, while its phase (`key`) lasts. */
let retry: { key: string; play: () => void } | null = null;

/**
 * Each phase's sound starts once: by `${run}:${id}:${phase}` (run 0 is the
 * real clock), the moment it may be tried again (performance.now()):
 * Infinity once it started, a few seconds on when its file could not be
 * fetched (the athan joins part-way when it comes).
 */
const handled = new Map<string, number>();
const FETCH_RETRY_MS = 5000;

/** Only today's and yesterday's sounds on the real clock matter; a preview's go when it ends. */
function pruneHandled(today: string): void {
  const since = addDays(today, -1);
  for (const key of handled.keys()) {
    const [run, day] = key.split(':');
    if (run !== '0' || day < since) handled.delete(key);
  }
}

/**
 * Recordings are played from in-memory blobs. Media elements fetch in byte
 * ranges, which the service worker's runtime cache does not answer reliably
 * offline; a whole-file fetch always comes straight out of the cache.
 */
const blobs = new Map<string, Promise<string>>();

function playable(url: string): Promise<string> {
  if (url.startsWith('blob:')) return Promise.resolve(url);
  let p = blobs.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.blob();
      })
      .then((b) => URL.createObjectURL(b));
    p.catch(() => blobs.delete(url));
    blobs.set(url, p);
  }
  return p;
}

/** Warms the blobs of every sound the settings use, and lets go of those no longer chosen (unless one is on an element). */
function preloadSounds(): void {
  const s = settings.value;
  const kinds = [...PRAYERS.filter((p) => s.sounds[p].enabled), ...(s.tahajjud.enabled ? (['tahajjud'] as const) : [])];
  const urls = new Set(kinds.flatMap((k) => recordingFor(k)?.url ?? []));
  const chime = resolveAudio('chime');
  if (chime) urls.add(chime.url);
  for (const url of urls) playable(url).catch(() => {});
  for (const [url, p] of blobs) {
    if (urls.has(url)) continue;
    blobs.delete(url);
    p.then((src) => src !== athanEl.src && src !== chimeEl.src && URL.revokeObjectURL(src)).catch(() => {});
  }
}

const clampVolume = (v: number) => Math.min(1, Math.max(0, v));

/** Bumped by every start and stop, so a recording still loading when it is stopped or replaced never plays. */
const generation = new Map<HTMLAudioElement, number>();
const nextGeneration = (el: HTMLAudioElement) => {
  const g = (generation.get(el) ?? 0) + 1;
  generation.set(el, g);
  return g;
};

/**
 * Plays `url` on `el`. With `offsetSec` the recording keeps time with the
 * clock (an athan joined part-way stays in step however long it takes to
 * load); without, it plays from the start. A play the browser blocks is
 * retried by the next tap while the phase `key` lasts. False when the file
 * could not be fetched.
 */
async function start(
  el: HTMLAudioElement,
  url: string,
  volume: number,
  key: string | null,
  offsetSec?: number,
): Promise<boolean> {
  const gen = nextGeneration(el);
  const asked = Date.now();
  let src: string;
  try {
    src = await playable(url);
  } catch {
    return false;
  }
  if (generation.get(el) !== gen) return true;
  if (el.src !== src) el.src = src;
  el.volume = clampVolume(volume);
  el.currentTime = offsetSec === undefined ? 0 : offsetSec + (Date.now() - asked) / 1000;
  try {
    await el.play();
    if (generation.get(el) !== gen) return true;
    if (el === athanEl) athanSounding.value = playingId !== null && playingId !== 'preview';
    audioBlocked.value = false;
    retry = null;
  } catch (e) {
    if ((e as DOMException).name === 'NotAllowedError' && key) {
      const blockedAt = Date.now();
      audioBlocked.value = true;
      retry = {
        key,
        play: () =>
          void start(el, url, volume, key, offsetSec === undefined ? undefined : offsetSec + (Date.now() - blockedAt) / 1000),
      };
    }
  }
  return true;
}

function stopAthan(): void {
  nextGeneration(athanEl);
  athanEl.pause();
  playingId = null;
  retry = null;
  athanSounding.value = false;
}

/**
 * Plays a sound once for the settings screen and returns a stopper, or
 * returns null while a real athan is playing (a preview would cut it off).
 */
export function previewSound(audioId: string, volume: number): (() => void) | null {
  if (playingId && playingId !== 'preview') return null;
  const a = resolveAudio(audioId);
  if (!a) return null;
  void start(athanEl, a.url, volume, null);
  playingId = 'preview';
  return stopPreview;
}

/** Follows the volume slider while a preview plays. */
export function setPreviewVolume(volume: number): void {
  if (playingId === 'preview') athanEl.volume = clampVolume(volume);
}

/** Stops a settings preview, leaving an athan that has since started playing. */
export function stopPreview(): void {
  if (playingId === 'preview') stopAthan();
}

/** First tap after a blocked autoplay replays what should be sounding. */
export function unlockAudio(): void {
  audioBlocked.value = false;
  retry?.play();
}

/**
 * Drives sound from the clock state: chime at the start of the pre-athan
 * countdown, athan from the moment it is due (joined part-way if the page
 * loads late), silence once the sequence is dismissed. The wall's display
 * schedule owns the backlight (prayer/stage.ts wakes a sleeping wall for
 * the phases that sound).
 */
export function startAudioController(): void {
  effect(preloadSounds);
  let prunedFor = '';
  effect(() => {
    const st = clock.value;
    const s = settings.value;
    const n = tick.value.getTime();
    const t = st?.takeover ?? null;
    const run = previewRun();

    if (run === 0 && toISODate(tick.value) !== prunedFor) {
      prunedFor = toISODate(tick.value);
      pruneHandled(prunedFor);
    }
    if (playingId && playingId !== 'preview' && t?.id !== playingId) stopAthan();
    const key = t ? `${run}:${t.id}:${t.phase}` : null;
    // A blocked sound is not played by a tap after its phase.
    if (retry && retry.key !== key) retry = null;
    if (!st || !t || !key) return;

    const kind = t.kind === 'tahajjud' ? 'tahajjud' : t.prayer;
    const choice = kind === 'tahajjud' ? s.tahajjud : kind ? s.sounds[kind] : null;
    // The volume follows the settings while the athan plays.
    if (playingId === t.id && choice) athanEl.volume = clampVolume(choice.volume);

    if (performance.now() < (handled.get(key) ?? 0)) return;
    const tried = (p: Promise<boolean>) =>
      void p.then((ok) => {
        if (!ok) handled.set(key, performance.now() + FETCH_RETRY_MS);
      });

    if (t.phase === 'pre' && s.chime.enabled && n - t.phaseStart.getTime() < 5000) {
      const chime = resolveAudio('chime');
      if (!chime) return; // audio index still loading; retry next tick
      tried(start(chimeEl, chime.url, s.chime.volume, key));
    }
    if (t.phase === 'athan' && kind && choice?.enabled) {
      const a = recordingFor(kind);
      if (!a) return; // audio index (or uploads) still loading; retry next tick
      const offset = (n - t.athan.getTime()) / 1000;
      if (a.durationSec === 0 || offset < a.durationSec - 1) {
        playingId = t.id;
        tried(start(athanEl, a.url, choice.volume, key, Math.max(0, offset)));
      }
    }
    handled.set(key, Infinity);
  });
}
