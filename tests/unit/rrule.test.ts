import { describe, expect, it } from 'vitest';
import { endSeriesBefore, fromRecurrence, toRRule } from '../../src/calendar/rrule';

describe('rrule', () => {
  it('round-trips the editor subset', () => {
    const r = { every: 2, unit: 'week' as const, weekdays: [1, 3] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[], until: '2026-12-31' };
    const line = toRRule(r, true);
    expect(line).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231');
    expect(fromRecurrence([line])).toEqual(r);
  });
  it('writes timed UNTIL as the end of the local day in UTC', () => {
    expect(toRRule({ every: 1, unit: 'day', until: '2026-11-10' }, false)).toBe('RRULE:FREQ=DAILY;UNTIL=20261111T055959Z');
    expect(fromRecurrence(['RRULE:FREQ=DAILY;UNTIL=20261111T055959Z'])?.until).toBe('2026-11-10');
  });
  it('rejects rules the editor cannot show', () => {
    expect(fromRecurrence(['RRULE:FREQ=MONTHLY;BYDAY=2TU'])).toBeNull();
    expect(fromRecurrence(['RRULE:FREQ=WEEKLY;COUNT=5'])).toBeNull();
    expect(fromRecurrence(['EXDATE:20261104'])).toBeNull();
  });
  it('ends a series before an occurrence', () => {
    expect(endSeriesBefore(['RRULE:FREQ=WEEKLY;COUNT=10', 'EXDATE:20261104'], '2026-11-18', true)).toEqual([
      'RRULE:FREQ=WEEKLY;UNTIL=20261117',
      'EXDATE:20261104',
    ]);
  });
});
