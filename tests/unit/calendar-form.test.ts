import { describe, expect, it } from 'vitest';
import type { CalEvent } from '../../src/calendar/types';
import { draftFromForm, formFromEvent, formProblem, newForm, shiftStart, type Form } from '../../src/features/calendar/form';

const at = (s: string) => new Date(s).getTime();

const valid = (over: Partial<Form> = {}): Form => ({
  ...newForm('2026-11-06', at('2026-11-04T11:44'), 'family@demo'),
  title: 'Dentist',
  profiles: ['asiyah'],
  ...over,
});

describe('event editor form', () => {
  it('starts a new event at the next half hour today, or 9 AM on another day', () => {
    const f = newForm(undefined, at('2026-11-04T11:44'), 'cal');
    expect([f.startDate, f.startTime, f.endDate, f.endTime]).toEqual(['2026-11-04', '12:00', '2026-11-04', '13:00']);
    const g = newForm('2026-11-06', at('2026-11-04T11:44'), 'cal', true);
    expect([g.startTime, g.endTime, g.countdown, g.reminder]).toEqual(['09:00', '10:00', true, 'none']);
  });
  it('requires a title, a profile, a calendar and an end after the start', () => {
    expect(formProblem(valid())).toBeNull();
    expect(formProblem(valid({ title: '  ' }))).toBe('Add a title');
    expect(formProblem(valid({ profiles: [] }))).toBe('Choose who it is for');
    expect(formProblem(valid({ calendarId: '' }))).toBe('No calendar to save to');
    expect(formProblem(valid({ endTime: '08:00' }))).toBe('The end is before the start');
    expect(formProblem(valid({ allDay: true, endDate: '2026-11-05' }))).toBe('The end is before the start');
    expect(formProblem(valid({ allDay: true, endDate: '2026-11-06' }))).toBeNull();
  });
  it('builds timed and all-day drafts', () => {
    const d = draftFromForm(valid({ reminder: '10', location: ' Smile Dental ', notes: '' }), false);
    expect(d.start).toEqual(new Date('2026-11-06T09:00'));
    expect(d.end).toEqual(new Date('2026-11-06T10:00'));
    expect([d.reminderMinutes, d.location, d.description, d.keepRecurrence]).toEqual([10, 'Smile Dental', undefined, false]);
    const a = draftFromForm(valid({ allDay: true, endDate: '2026-11-08', reminder: 'none' }), true);
    expect([a.firstDay, a.lastDay, a.reminderMinutes, a.keepRecurrence]).toEqual(['2026-11-06', '2026-11-08', null, true]);
    expect(a.end).toEqual(new Date('2026-11-09T00:00'));
    expect(draftFromForm(valid({ reminder: 'default' }), false).reminderMinutes).toBeUndefined();
  });
  it('keeps the duration when the start moves, across midnight too', () => {
    const f = shiftStart(valid({ startTime: '09:00', endTime: '10:30' }), '2026-11-06', '23:00');
    expect([f.endDate, f.endTime]).toEqual(['2026-11-07', '00:30']);
    const a = shiftStart(valid({ allDay: true, endDate: '2026-11-08' }), '2026-11-10', '09:00');
    expect([a.startDate, a.endDate]).toEqual(['2026-11-10', '2026-11-12']);
  });
  it('reads an all-day multi-day event back as its first and last day', () => {
    const ev: CalEvent = {
      key: 'c::g',
      calendarId: 'c',
      id: 'g',
      title: 'Grandma visiting',
      allDay: true,
      start: new Date('2026-11-12T00:00'),
      end: new Date('2026-11-16T00:00'),
      editable: true,
      reminderMinutes: undefined,
    };
    const f = formFromEvent(ev, ['*'], true);
    expect([f.startDate, f.endDate, f.allDay, f.reminder, f.countdown]).toEqual([
      '2026-11-12',
      '2026-11-15',
      true,
      'default',
      true,
    ]);
  });
});
