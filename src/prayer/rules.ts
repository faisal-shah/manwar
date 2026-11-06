import type { Face } from '../app/face';
import { WAKE_MS } from '../core/sleep';
import type { ClockState, Takeover } from './core/schedule';
import type { Settings, ThemeKey } from './core/settings';

/*
 * The rules between the wall's two faces, pure (prayer/stage.ts applies
 * them from the wall's signals; tests/unit/prayer-rules.test.ts).
 */

/** Without a touch for this long, the wall goes back to its resting face: as long as a wake lasts (core/sleep.ts). */
export const FACE_IDLE_MS = WAKE_MS;

/**
 * The face the wall rests on: the household's choice (Settings > Display),
 * except Family while a note waits or a timer runs, which a resting prayer
 * face would hide, and before the household has a place (the prayer face's
 * setup card is no night screen).
 */
export function restingFace(w: { notes: number; timer: boolean; place: boolean; chosen: Face }): Face {
  return w.notes || w.timer || !w.place ? 'family' : w.chosen;
}

/** A phase that sounds: its athan's recording is on (the iqamah countdown never sounds). Only these wake a sleeping wall. */
export function sounds(t: Takeover, s: Settings): boolean {
  if (t.phase === 'iqamah') return false;
  return t.kind === 'tahajjud' ? s.tahajjud.enabled : !!t.prayer && s.sounds[t.prayer].enabled;
}

/**
 * The athan sequence takes the wall (over either face, waking it): the real
 * clock's takeover (a settings preview is the prayer face's own), and on a
 * sleeping wall only a phase that sounds, so an athan turned off does not
 * light the room.
 */
export function inSequence(t: Takeover | null, s: Settings, w: { previewing: boolean; asleep: boolean }): boolean {
  return !!t && !w.previewing && (sounds(t, s) || !w.asleep);
}

/**
 * What the prayer face's clock shows. Asleep (the wall resting on it), the
 * night clock is the night screen and no takeover lights the room: the wall
 * is awake for every phase that should show (`inSequence`). A preview may
 * force its theme.
 */
export function clockView(
  st: Pick<ClockState, 'theme' | 'takeover'>,
  w: { asleep: boolean; previewTheme: ThemeKey | null },
): { theme: ThemeKey; takeover: Takeover | null } {
  return { theme: w.previewTheme ?? (w.asleep ? 'night' : st.theme), takeover: w.asleep ? null : st.takeover };
}

/** A takeover starting within this long already holds an update reload (the reload and the media's first load take a moment). */
export const BUSY_AHEAD_MS = 3 * 60_000;

/**
 * The prayer face has something a reload would cut short: the athan
 * sequence, now or within BUSY_AHEAD_MS, its settings, the viewer, a
 * preview.
 */
export function prayerBusyNow(
  st: Pick<ClockState, 'now' | 'takeover' | 'nextTakeover'> | null,
  open: { settings: boolean; viewer: boolean; previewing: boolean },
): boolean {
  if (open.settings || open.viewer || open.previewing) return true;
  if (!st) return false;
  return !!st.takeover || (!!st.nextTakeover && st.nextTakeover.getTime() - st.now.getTime() < BUSY_AHEAD_MS);
}

/** A preview left running ends on its own after this long. */
export const PREVIEW_LIMIT_MS = 20 * 60_000;
/** A preview ends this long before the real clock's next takeover, which then starts on the real clock. */
export const PREVIEW_MARGIN_MS = 30_000;
/** Shorter than this before then, a preview is not worth starting. */
const PREVIEW_MIN_MS = 60_000;

/**
 * When a preview started now must end: after PREVIEW_LIMIT_MS, or before
 * the real clock's next takeover (`real`: the clock at the real time), so
 * a preview never hides a real athan. Null when none may start: the real
 * sequence is on, or starts within a minute or so.
 */
export function previewEnd(real: Pick<ClockState, 'now' | 'takeover' | 'nextTakeover'>): number | null {
  if (real.takeover) return null;
  const now = real.now.getTime();
  const end = Math.min(now + PREVIEW_LIMIT_MS, (real.nextTakeover?.getTime() ?? Infinity) - PREVIEW_MARGIN_MS);
  return end - now < PREVIEW_MIN_MS ? null : end;
}
