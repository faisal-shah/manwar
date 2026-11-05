import { describe, expect, it } from 'vitest';
import { plural, pluralWord } from '../../src/lib/text';
import { countLabel, daysText, reminderLabel } from '../../src/features/calendar/layout';
import { lateLabel } from '../../src/features/tasks/logic';
import { describeRepeat } from '../../src/lib/repeat';

/** Every count the wall shows takes the singular for one and the plural otherwise, zero included. */
describe('counts with their nouns', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'star')).toBe('1 star');
    expect(plural(0, 'star')).toBe('0 stars');
    expect(plural(2, 'star')).toBe('2 stars');
    expect(plural(1250, 'star')).toBe('1,250 stars');
    expect(plural(1, 'more message', 'more messages')).toBe('1 more message');
    expect(plural(3, 'more message', 'more messages')).toBe('3 more messages');
    expect(pluralWord(1, 'day')).toBe('day');
    expect(pluralWord(7, 'day')).toBe('days');
  });

  it('says one minute, hour and day before an event', () => {
    expect(reminderLabel(1)).toBe('1 minute before');
    expect(reminderLabel(10)).toBe('10 minutes before');
    expect(reminderLabel(60)).toBe('1 hour before');
    expect(reminderLabel(120)).toBe('2 hours before');
    expect(reminderLabel(1440)).toBe('1 day before');
    expect(reminderLabel(2880)).toBe('2 days before');
  });

  it('counts countdown days, late days, events and repeats', () => {
    expect([daysText(0), daysText(1), daysText(9)]).toEqual(['Today!', '1 day', '9 days']);
    expect([lateLabel(1), lateLabel(3)]).toEqual(['1 day late', '3 days late']);
    expect([countLabel(1, false), countLabel(2, true)]).toEqual(['1 event', '2 events today']);
    expect(describeRepeat({ every: 2, unit: 'day' }, '2026-11-04')).toBe('Every 2 days');
  });
});
