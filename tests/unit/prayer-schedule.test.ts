import { describe, expect, it } from 'vitest';
import {
  SLOT_PERIOD,
  calligraphyWindowId,
  clockState,
  computeDays,
  periodMoment,
  phaseId,
  type AthanLength,
  type PeriodKey,
} from '../../src/prayer/core/schedule';
import { BG_SLOTS, sanitizeSettings, settingsChanges, type Settings } from '../../src/prayer/core/settings';
import { CHICAGO } from './prayer-prayer.test';

// Chicago 2026-10-29 (Thursday): Fajr 06:02, Sunrise 07:19, Dhuhr 12:35,
// Asr 16:06, Maghrib 17:48, Isha 19:06. Tests run with TZ=America/Chicago.
const at = (hhmmss: string, day = 29) => {
  const [h, m, s = 0] = hhmmss.split(':').map(Number);
  return new Date(2026, 9, day, h, m, s);
};
const athan200: AthanLength = () => 200;
const state = (now: Date, s: Settings = CHICAGO, len: AthanLength = athan200, dismissed?: Set<string>) =>
  clockState(now, computeDays(now, s), s, len, dismissed);

describe('clockState', () => {
  it('tracks current/next prayers and the athan countdown', () => {
    const st = state(at('14:00'));
    expect(st.current.prayer).toBe('dhuhr');
    expect(st.next.prayer).toBe('asr');
    expect(st.countdown.kind).toBe('athan');
    expect(st.period.key).toBe('dhuhr');
    expect(st.takeover).toBeNull();
  });

  it('counts down to iqamah between athan and iqamah', () => {
    const st = state(at('12:45'));
    expect(st.countdown).toMatchObject({ kind: 'iqamah' });
    expect(st.countdown.target.getTime() - st.current.athan.getTime()).toBe(15 * 60_000);
  });

  it('runs the athan sequence: pre -> athan -> dua -> iqamah', () => {
    const dhuhr = state(at('12:00')).slots[1].athan.getTime();
    const phase = (offsetSec: number) => state(new Date(dhuhr + offsetSec * 1000)).takeover?.phase ?? null;
    expect(phase(-61)).toBeNull();
    expect(phase(-30)).toBe('pre');
    expect(phase(0)).toBe('athan');
    expect(phase(199)).toBe('athan');
    expect(phase(200)).toBe('dua');
    expect(phase(275)).toBeNull();
    expect(phase(15 * 60 - 30)).toBe('iqamah');
    expect(phase(15 * 60)).toBeNull();
  });

  it('uses a fixed screen length when the athan sound is off and honours dismissal', () => {
    const silent: AthanLength = () => null;
    const dhuhr = state(at('12:00')).slots[1].athan.getTime();
    expect(state(new Date(dhuhr + 89_000), CHICAGO, silent).takeover?.phase).toBe('athan');
    expect(state(new Date(dhuhr + 91_000), CHICAGO, silent).takeover?.phase).toBe('dua');
  });

  it('closes one phase at a time: the athan still comes after the countdown is closed', () => {
    const dhuhr = state(at('12:00')).slots[1].athan.getTime();
    const at_ = (sec: number, ids: string[]) => state(new Date(dhuhr + sec * 1000), CHICAGO, athan200, new Set(ids)).takeover;
    const pre = phaseId(at_(-30, [])!);
    expect(at_(-20, [pre])).toBeNull();
    expect(at_(5, [pre])?.phase).toBe('athan');
    const athan = phaseId(at_(5, [])!);
    expect(at_(10, [pre, athan])).toBeNull();
    expect(at_(210, [pre, athan])?.phase).toBe('dua');
    expect(at_(15 * 60 - 30, [pre, athan])?.phase).toBe('iqamah');
  });

  it('shortens or drops the iqamah countdown when the dua runs into iqamah (Maghrib +5)', () => {
    const maghrib = state(at('17:00')).slots[3].athan.getTime();
    expect(state(new Date(maghrib + 4 * 60_000)).takeover?.phase).toBe('dua');
    expect(state(new Date(maghrib + 4.9 * 60_000)).takeover?.phase).toBe('iqamah');
    const long: AthanLength = () => 280;
    expect(state(new Date(maghrib + 5.5 * 60_000), CHICAGO, long).takeover?.phase).toBe('dua');
    expect(state(new Date(maghrib + 6 * 60_000), CHICAGO, long).takeover).toBeNull();
  });

  it('keeps the evening going when Isha falls after midnight', () => {
    const late: Settings = { ...CHICAGO, adjust: { ...CHICAGO.adjust, isha: 330 } }; // Isha 00:36
    const st = state(at('00:10', 30), late);
    expect(st.period.key).toBe('maghrib');
    expect(st.current.prayer).toBe('maghrib');
    expect(state(at('00:40', 30), late).period.key).toBe('isha');
  });

  it('ends a calligraphy window early once dismissed, and says when an override ends', () => {
    const st = state(at('12:50'));
    expect(st.theme).toBe('calligraphy');
    expect(st.themeUntil!.getTime() - st.current.athan.getTime()).toBe(45 * 60_000);
    const ended = state(at('12:50'), CHICAGO, athan200, new Set([calligraphyWindowId(st.current)]));
    expect(ended.theme).toBe('classic');
    expect(ended.themeUntil).toBeNull();
    // Only that prayer's window: Asr's still shows.
    expect(state(at('16:20'), CHICAGO, athan200, new Set([calligraphyWindowId(st.current)])).theme).toBe('calligraphy');
    const night = state(at('23:00'));
    expect(night.theme).toBe('night');
    expect(night.themeUntil!.getTime()).toBe(night.next.athan.getTime());
    expect(state(at('14:00')).themeUntil).toBeNull();
  });

  it('picks the night theme between Isha+60 and Fajr, calligraphy after each athan', () => {
    expect(state(at('19:30')).theme).toBe('calligraphy'); // 24 min after Isha
    expect(state(at('20:00')).theme).toBe('classic');
    expect(state(at('20:10')).theme).toBe('night');
    expect(state(at('03:00')).theme).toBe('night');
    expect(state(at('06:10')).theme).toBe('calligraphy');
    expect(state(at('07:00')).theme).toBe('classic');
    expect(state(at('20:10'), { ...CHICAGO, night: { ...CHICAGO.night, enabled: false } }).theme).toBe('classic');
  });

  it('names periods including sunrise, duha and tahajjud', () => {
    expect(state(at('07:25')).period.key).toBe('sunrise');
    expect(state(at('07:25')).makruh?.kind).toBe('sunrise');
    expect(state(at('09:00')).period.key).toBe('duha');
    expect(state(at('12:30')).makruh?.kind).toBe('zawal');
    expect(state(at('03:30')).period.key).toBe('tahajjud');
    expect(state(at('23:00')).period.key).toBe('isha');
  });

  it('lands previews inside each part of the day and each background slot', () => {
    const thu = state(at('12:00')).today;
    const keys: PeriodKey[] = ['fajr', 'sunrise', 'duha', 'dhuhr', 'asr', 'maghrib', 'isha', 'tahajjud'];
    for (const p of keys) expect(state(periodMoment(thu, p)).period.key).toBe(p);
    for (const slot of BG_SLOTS) expect(state(periodMoment(thu, SLOT_PERIOD[slot])).period.bg).toBe(slot);
    const fri = state(at('12:00', 30)).today;
    expect(state(periodMoment(fri, 'dhuhr')).period.key).toBe('jumuah');
  });

  it("wraps across midnight: after Isha the next prayer is tomorrow's Fajr", () => {
    const st = state(at('23:30'));
    expect(st.current.prayer).toBe('isha');
    expect(st.next.prayer).toBe('fajr');
    expect(st.next.athan.getDate()).toBe(30);
    const early = state(at('02:00'));
    expect(early.current.prayer).toBe('isha');
    expect(early.current.athan.getDate()).toBe(28);
  });

  it("renames Friday Dhuhr to Jumu'ah with iqamah at the first Jumu'ah time", () => {
    const fri = state(at('13:00', 30));
    expect(fri.slots[1].name).toBe('jumuah');
    expect(fri.slots[1].iqamah.getHours()).toBe(13);
    expect(fri.slots[1].iqamah.getMinutes()).toBe(30);
    expect(state(at('13:00')).slots[1].name).toBe('dhuhr');
  });

  it('switches countdowns to iftar and suhoor during Ramadan', () => {
    const ram: Settings = { ...CHICAGO, ramadan: 'on' };
    expect(state(at('17:00'), ram).countdown.kind).toBe('iftar');
    expect(state(at('03:00'), ram).countdown.kind).toBe('suhoor');
    expect(state(at('03:00')).countdown.kind).toBe('athan');
  });

  it('adds a tahajjud athan only when enabled', () => {
    const on: Settings = { ...CHICAGO, tahajjud: { ...CHICAGO.tahajjud, enabled: true } };
    const lastThird = state(at('23:00')).tahajjud;
    expect(state(new Date(lastThird.getTime() + 10_000), on).takeover?.kind).toBe('tahajjud');
    expect(state(new Date(lastThird.getTime() + 10_000)).takeover).toBeNull();
  });
});

describe('settings changes (what a save writes to the household document)', () => {
  const was = sanitizeSettings({});
  it('names only the values that changed, nested maps by their changed fields', () => {
    expect(settingsChanges(was, was)).toBeNull();
    const next = { ...was, sounds: { ...was.sounds, asr: { ...was.sounds.asr, volume: 0.4 } }, dayTheme: 'kids' as const };
    expect(settingsChanges(was, next)).toEqual({ sounds: { asr: { volume: 0.4 } }, dayTheme: 'kids' });
  });
  it('writes a list or a place whole, and a cleared place as null', () => {
    const place = { name: 'Austin', latitude: 30.27, longitude: -97.74, timezone: 'America/Chicago' };
    const placed = { ...was, place };
    expect(settingsChanges(was, placed)).toEqual({ place });
    expect(settingsChanges(placed, { ...placed, place: null })).toEqual({ place: null });
    // Another city's coordinates must not land beside this one's time zone: the place goes whole.
    const moved = { name: 'Dallas', latitude: 32.78, longitude: -96.8, timezone: 'America/Chicago' };
    expect(settingsChanges(placed, { ...placed, place: moved })).toEqual({ place: moved });
    expect(settingsChanges(placed, { ...placed, place: { ...place, name: 'Austin, Texas' } })).toEqual({
      place: { ...place, name: 'Austin, Texas' },
    });
    expect(settingsChanges(was, { ...was, jumuah: { ...was.jumuah, times: ['13:15', '14:00'] } })).toEqual({
      jumuah: { times: ['13:15', '14:00'] },
    });
  });
});
