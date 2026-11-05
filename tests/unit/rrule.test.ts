import { describe, expect, it } from 'vitest';
import { endSeriesBefore, fromRecurrence, shiftByday, toRRule } from '../../src/calendar/rrule';

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
    expect(endSeriesBefore(['RRULE:FREQ=WEEKLY;COUNT=10', 'EXDATE:20261104'], new Date(2026, 10, 18), true)).toEqual([
      'RRULE:FREQ=WEEKLY;UNTIL=20261117',
      'EXDATE:20261104',
    ]);
  });
  it('ends a timed series a second before the occurrence', () => {
    expect(endSeriesBefore(['RRULE:FREQ=WEEKLY'], new Date('2026-11-21T15:30:00Z'), false)).toEqual([
      'RRULE:FREQ=WEEKLY;UNTIL=20261121T152959Z',
    ]);
  });
});

describe('shiftByday', () => {
  it('moves the weekdays of a weekly rule, wrapping around the week and keeping the other parts and lines', () => {
    const lines = ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SA;UNTIL=20270101', 'EXDATE;VALUE=DATE:20261114'];
    expect(shiftByday(lines, 1)).toEqual([
      'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,TU;UNTIL=20270101',
      'EXDATE;VALUE=DATE:20261114',
    ]);
    expect(shiftByday(lines, -2)).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH,SA;UNTIL=20270101', lines[1]]);
  });
  it('leaves rules it should not move: a whole number of weeks, no BYDAY, another frequency, ordinals', () => {
    for (const l of [
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'RRULE:FREQ=WEEKLY',
      'RRULE:FREQ=MONTHLY;BYDAY=1MO',
      'RRULE:FREQ=WEEKLY;BYDAY=1MO',
    ])
      expect(shiftByday([l], l === 'RRULE:FREQ=WEEKLY;BYDAY=MO' ? 14 : 3)).toEqual([l]);
  });
});
