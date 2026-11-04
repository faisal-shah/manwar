import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, formatTime, formatTimeRange, startOfWeek, weekdayOf } from '../../src/lib/date';
import { describeRepeat, lastOccurrenceOnOrBefore, occurrencesBetween, occursOn } from '../../src/lib/repeat';

describe('date', () => {
  it('adds days across DST and month ends', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // DST ends Nov 1 in Chicago
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-11-01', '2026-11-08')).toBe(7);
  });
  it('clamps months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });
  it('finds week starts', () => {
    expect(weekdayOf('2026-11-04')).toBe(3);
    expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-04', 1)).toBe('2026-11-02');
  });
  it('formats times Skylight-style', () => {
    const d = (h: number, m = 0) => new Date(2026, 10, 4, h, m);
    expect(formatTime(d(11, 44), '12h')).toBe('11:44 AM');
    expect(formatTime(d(15), '12h')).toBe('3 PM');
    expect(formatTime(d(15), '24h')).toBe('15:00');
    expect(formatTimeRange(d(8), d(9, 30), '12h')).toBe('8 - 9:30 AM');
    expect(formatTimeRange(d(11, 30), d(12), '12h')).toBe('11:30 AM - 12 PM');
  });
});

describe('repeat', () => {
  it('daily every N', () => {
    const r = { every: 2, unit: 'day' as const };
    expect(occursOn(r, '2026-11-01', '2026-11-03')).toBe(true);
    expect(occursOn(r, '2026-11-01', '2026-11-04')).toBe(false);
    expect(occursOn(r, '2026-11-01', '2026-10-31')).toBe(false);
  });
  it('weekly on weekdays, every other week', () => {
    const r = { every: 2, unit: 'week' as const, weekdays: [1, 3] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] };
    expect(occurrencesBetween(r, '2026-11-02', '2026-11-01', '2026-11-21')).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-16',
      '2026-11-18',
    ]);
  });
  it('monthly and yearly keep the day', () => {
    expect(occursOn({ every: 1, unit: 'month' }, '2026-01-31', '2026-02-28')).toBe(false);
    expect(occursOn({ every: 1, unit: 'month' }, '2026-01-31', '2026-03-31')).toBe(true);
    expect(occursOn({ every: 1, unit: 'year' }, '2024-02-29', '2028-02-29')).toBe(true);
  });
  it('honours until', () => {
    const r = { every: 1, unit: 'day' as const, until: '2026-11-05' };
    expect(occursOn(r, '2026-11-01', '2026-11-05')).toBe(true);
    expect(occursOn(r, '2026-11-01', '2026-11-06')).toBe(false);
  });
  it('finds the last occurrence', () => {
    const r = { every: 1, unit: 'week' as const, weekdays: [1] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[] };
    expect(lastOccurrenceOnOrBefore(r, '2026-10-05', '2026-11-04')).toBe('2026-11-02');
    expect(lastOccurrenceOnOrBefore(undefined, '2026-11-01', '2026-11-04')).toBe('2026-11-01');
  });
  it('describes rules', () => {
    expect(describeRepeat({ every: 1, unit: 'week', weekdays: [1, 2, 3, 4, 5] }, '2026-11-02')).toBe('Weekdays');
    expect(describeRepeat({ every: 1, unit: 'week', weekdays: [3] }, '2026-11-04')).toBe('Weekly on Wednesday');
    expect(describeRepeat({ every: 2, unit: 'week', weekdays: [1, 3] }, '2026-11-04')).toBe('Every 2 weeks on Mon, Wed');
    expect(describeRepeat({ every: 1, unit: 'day' }, '2026-11-04')).toBe('Daily');
  });
});
