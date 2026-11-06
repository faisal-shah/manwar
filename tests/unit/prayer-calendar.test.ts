import { describe, expect, it } from 'vitest';
import { clockFace, countdownFace, hijriDate, minutesLeft, nextHijriDate } from '../../src/prayer/core/calendar';

/** The prayer clock's calendar and clock faces (prayer/core/calendar.ts). Unit tests run with TZ=America/Chicago. */

describe('Hijri dates (Umm al-Qura)', () => {
  it('gives the day, month and its name', () => {
    expect(hijriDate(new Date(2026, 1, 18), 0)).toEqual({ day: 1, month: 9, year: 1447, monthName: 'Ramadan' });
    expect(hijriDate(new Date(2026, 2, 20), 0)).toMatchObject({ day: 1, month: 10, monthName: 'Shawwal' });
  });

  it('shifts by the adjustment, to follow the local moonsighting', () => {
    expect(hijriDate(new Date(2026, 1, 18), -1)).toMatchObject({ day: 29, month: 8, monthName: "Sha'ban" });
    expect(hijriDate(new Date(2026, 1, 17), 1)).toMatchObject({ day: 1, month: 9 });
  });

  it('finds the next date of a Hijri day, today included', () => {
    expect(nextHijriDate(new Date(2026, 0, 1), 9, 1, 0)).toEqual(new Date(2026, 1, 18));
    expect(nextHijriDate(new Date(2026, 1, 18), 9, 1, 0)).toEqual(new Date(2026, 1, 18));
    // Ramadan 1 1448 comes the next February.
    expect(nextHijriDate(new Date(2026, 1, 19), 9, 1, 0)!.getFullYear()).toBe(2027);
    expect(nextHijriDate(new Date(2026, 0, 1), 9, 31, 0)).toBeNull();
  });
});

describe('clock faces', () => {
  it("follow the household's time format, the meridiem apart", () => {
    expect(clockFace(new Date(2026, 9, 29, 16, 6), '12h')).toEqual({ hm: '4:06', ampm: 'PM' });
    expect(clockFace(new Date(2026, 9, 29, 0, 5), '12h')).toEqual({ hm: '12:05', ampm: 'AM' });
    expect(clockFace(new Date(2026, 9, 29, 13, 0), '12h')).toEqual({ hm: '1:00', ampm: 'PM' });
    expect(clockFace(new Date(2026, 9, 29, 16, 6), '24h')).toEqual({ hm: '16:06', ampm: '' });
    expect(clockFace(new Date(2026, 9, 29, 6, 2), '24h')).toEqual({ hm: '06:02', ampm: '' });
  });

  it('count down in hours and minutes, then minutes and seconds in the last hour', () => {
    expect(countdownFace(4.5 * 3600_000)).toEqual({ value: '4:30', unit: 'HRS' });
    expect(countdownFace(3600_000)).toEqual({ value: '1:00', unit: 'HRS' });
    expect(countdownFace(3600_000 - 1000)).toEqual({ value: '59:59', unit: 'MIN' });
    expect(countdownFace(8 * 60_000 + 12_000)).toEqual({ value: '8:12', unit: 'MIN' });
    expect(countdownFace(-5000)).toEqual({ value: '0:00', unit: 'MIN' });
    expect(minutesLeft(8 * 60_000 + 1)).toBe(9);
    expect(minutesLeft(-1)).toBe(0);
  });
});
