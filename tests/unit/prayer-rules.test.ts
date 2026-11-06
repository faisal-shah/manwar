import { describe, expect, it } from 'vitest';
import { WAKE_MS } from '../../src/core/sleep';
import { clockState, computeDays } from '../../src/prayer/core/schedule';
import { DEFAULT_SETTINGS, type Settings } from '../../src/prayer/core/settings';
import {
  BUSY_AHEAD_MS,
  clockView,
  FACE_IDLE_MS,
  inSequence,
  prayerBusyNow,
  PREVIEW_LIMIT_MS,
  PREVIEW_MARGIN_MS,
  previewEnd,
  restingFace,
  sounds,
} from '../../src/prayer/rules';
import { CHICAGO } from './prayer-fixtures';

// Chicago 2026-10-29: Dhuhr 12:35, iqamah 12:50 (its countdown from 12:49), Asr 16:06.
const at = (hhmmss: string) => {
  const [h, m, s = 0] = hhmmss.split(':').map(Number);
  return new Date(2026, 9, 29, h, m, s);
};
const state = (now: Date, s: Settings = DEFAULT_SETTINGS) => clockState(now, computeDays(now, CHICAGO, s), s, () => 200);
const MUTED: Settings = {
  ...DEFAULT_SETTINGS,
  sounds: { ...DEFAULT_SETTINGS.sounds, dhuhr: { ...DEFAULT_SETTINGS.sounds.dhuhr, enabled: false } },
};
const NO_UI = { settings: false, viewer: false, previewing: false };

describe('the resting face', () => {
  it("is the household's choice, but Family while a note waits, a timer runs, or there is no place", () => {
    const base = { notes: 0, timer: false, place: true, chosen: 'prayer' as const };
    expect(restingFace(base)).toBe('prayer');
    expect(restingFace({ ...base, chosen: 'family' })).toBe('family');
    expect(restingFace({ ...base, notes: 1 })).toBe('family');
    expect(restingFace({ ...base, timer: true })).toBe('family');
    expect(restingFace({ ...base, place: false })).toBe('family');
  });

  it('comes back after as long without a touch as a wake lasts', () => {
    expect(FACE_IDLE_MS).toBe(WAKE_MS);
  });
});

describe('the athan sequence and a sleeping wall', () => {
  const athan = state(at('12:35:10')).takeover!;
  const iqamah = state(at('12:49:30')).takeover!;

  it('sounds for an athan whose recording is on, never for the iqamah countdown', () => {
    expect(athan.phase).toBe('athan');
    expect(iqamah.phase).toBe('iqamah');
    expect(sounds(athan, DEFAULT_SETTINGS)).toBe(true);
    expect(sounds(athan, MUTED)).toBe(false);
    expect(sounds(iqamah, DEFAULT_SETTINGS)).toBe(false);
  });

  it('takes the wall for the real clock only, and a sleeping wall only for a phase that sounds', () => {
    const awake = { previewing: false, asleep: false };
    const asleep = { previewing: false, asleep: true };
    expect(inSequence(null, DEFAULT_SETTINGS, awake)).toBe(false);
    expect(inSequence(athan, DEFAULT_SETTINGS, awake)).toBe(true);
    expect(inSequence(athan, DEFAULT_SETTINGS, { previewing: true, asleep: false })).toBe(false);
    expect(inSequence(athan, DEFAULT_SETTINGS, asleep)).toBe(true);
    expect(inSequence(athan, MUTED, asleep)).toBe(false);
    expect(inSequence(iqamah, DEFAULT_SETTINGS, awake)).toBe(true);
    expect(inSequence(iqamah, DEFAULT_SETTINGS, asleep)).toBe(false);
  });

  it('shows a sleeping wall the night clock without the takeover, whatever the time', () => {
    // The iqamah countdown (silent) and a Fajr whose athan is off come while the wall stays asleep.
    const st = state(at('12:49:30'));
    expect(clockView(st, { asleep: true, previewTheme: null })).toEqual({ theme: 'night', takeover: null });
    expect(clockView(state(at('14:53')), { asleep: true, previewTheme: null }).theme).toBe('night');
    expect(clockView(st, { asleep: false, previewTheme: null })).toEqual({ theme: st.theme, takeover: st.takeover });
    expect(clockView(st, { asleep: false, previewTheme: 'kids' }).theme).toBe('kids');
  });
});

describe('a reload waits for the prayer face', () => {
  it('while the sequence is on or starts within a few minutes', () => {
    expect(prayerBusyNow(null, NO_UI)).toBe(false);
    expect(prayerBusyNow(state(at('14:00')), NO_UI)).toBe(false);
    expect(prayerBusyNow(state(at('12:35:10')), NO_UI)).toBe(true);
    // Asr's countdown starts at 16:05.
    const soon = new Date(state(at('15:00')).nextTakeover!.getTime() - BUSY_AHEAD_MS + 1000);
    expect(prayerBusyNow(state(soon), NO_UI)).toBe(true);
    expect(prayerBusyNow(state(new Date(soon.getTime() - 2000)), NO_UI)).toBe(false);
  });

  it('while its settings, the viewer or a preview are open', () => {
    const st = state(at('14:00'));
    expect(prayerBusyNow(st, { ...NO_UI, settings: true })).toBe(true);
    expect(prayerBusyNow(st, { ...NO_UI, viewer: true })).toBe(true);
    expect(prayerBusyNow(st, { ...NO_UI, previewing: true })).toBe(true);
  });
});

describe('a settings preview', () => {
  it('ends on its own after twenty minutes', () => {
    const st = state(at('14:00'));
    expect(previewEnd(st)).toBe(st.now.getTime() + PREVIEW_LIMIT_MS);
  });

  it("ends before the real clock's next takeover", () => {
    const st = state(at('15:50'));
    expect(previewEnd(st)).toBe(st.nextTakeover!.getTime() - PREVIEW_MARGIN_MS);
    expect(st.nextTakeover!.getTime()).toBe(st.next.athan.getTime() - 60_000);
  });

  it('cannot start while the real sequence is on, or a minute before it', () => {
    expect(previewEnd(state(at('12:35:10')))).toBeNull();
    const next = state(at('15:50')).nextTakeover!.getTime();
    expect(previewEnd(state(new Date(next - PREVIEW_MARGIN_MS - 30_000)))).toBeNull();
  });

  it('ends before the tahajjud athan too, when it is on', () => {
    const on: Settings = { ...DEFAULT_SETTINGS, tahajjud: { ...DEFAULT_SETTINGS.tahajjud, enabled: true } };
    const lastThird = state(at('23:00')).tahajjud.getTime();
    const before = state(new Date(lastThird - 10 * 60_000), on);
    expect(before.nextTakeover!.getTime()).toBe(lastThird);
    expect(previewEnd(before)).toBe(lastThird - PREVIEW_MARGIN_MS);
    expect(state(new Date(lastThird - 10 * 60_000)).nextTakeover!.getTime()).toBeGreaterThan(lastThird);
  });
});
