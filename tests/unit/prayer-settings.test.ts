import { describe, expect, it } from 'vitest';
import { sanitizeSettings, settingsChanges } from '../../src/prayer/core/settings';

/* The prayer settings document: what is read from it (outside input) and what a save writes to it. */

describe('background settings', () => {
  it('keeps all or distinct photo ids (or none) and treats anything else as the defaults', () => {
    const s = sanitizeSettings({
      backgrounds: { fajr: ['a', 'a', 'upload:x'], sunrise: 'all', dhuhr: 'auto', asr: [], isha: [1, 2], night: 'x' },
    });
    expect(s.backgrounds.fajr).toEqual(['a', 'upload:x']);
    expect(s.backgrounds.sunrise).toBe('all');
    expect(s.backgrounds.dhuhr).toBeNull();
    expect(s.backgrounds.asr).toEqual([]);
    expect(s.backgrounds.isha).toBeNull();
    expect(s.backgrounds.night).toBeNull();
    expect(sanitizeSettings('junk').backgrounds.maghrib).toBeNull();
  });

  it("holds numbers to the ranges the controls allow, and keeps a Jumu'ah time", () => {
    const s = sanitizeSettings({
      hijriOffset: 1e9,
      gallery: { minutes: 0 },
      iqamah: { fajr: 500 },
      adjust: { isha: -99 },
      sounds: { fajr: { volume: 3 } },
      jumuah: { times: [''] },
    });
    expect(s.hijriOffset).toBe(2);
    expect(s.gallery.minutes).toBe(1);
    expect(s.iqamah.fajr).toBe(90);
    expect(s.adjust.isha).toBe(-30);
    expect(s.sounds.fajr.volume).toBe(1);
    expect(s.jumuah.times).toEqual(['13:30']);
  });

  it('shows uploads in the Gallery theme by default', () => {
    expect(sanitizeSettings(undefined).gallery.categories.uploads).toBe(true);
  });
});

describe('settings changes (what a save writes to the household document)', () => {
  const was = sanitizeSettings({});
  it('names only the values that changed, nested maps by their changed fields', () => {
    expect(settingsChanges(was, was)).toBeNull();
    const next = { ...was, sounds: { ...was.sounds, asr: { ...was.sounds.asr, volume: 0.4 } }, dayTheme: 'kids' as const };
    expect(settingsChanges(was, next)).toEqual({ sounds: { asr: { volume: 0.4 } }, dayTheme: 'kids' });
  });
  it('writes a list whole', () => {
    expect(settingsChanges(was, { ...was, jumuah: { ...was.jumuah, times: ['13:15', '14:00'] } })).toEqual({
      jumuah: { times: ['13:15', '14:00'] },
    });
  });
  it("keeps no place, time format or temperature unit of its own (they are the household's)", () => {
    const s = sanitizeSettings({ place: { name: 'Austin' }, clock24h: true, weather: { enabled: false, unit: 'c' } });
    expect(s).not.toHaveProperty('place');
    expect(s).not.toHaveProperty('clock24h');
    expect(s).not.toHaveProperty('weather');
    expect(s.showWeather).toBe(true);
  });
});
