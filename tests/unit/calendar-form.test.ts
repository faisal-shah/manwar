import { describe, expect, it } from 'vitest';
import type { CalEvent } from '../../src/calendar/types';
import {
  draftFromForm,
  formFromEvent,
  formProblem,
  newForm,
  sameRepeat,
  setAllDay,
  setEndTime,
  shiftStart,
  type Form,
} from '../../src/features/calendar/form';
import { plainText } from '../../src/features/calendar/text';

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
  it('gives an all-day event real times when it becomes timed', () => {
    const ev: CalEvent = {
      key: 'c::b',
      calendarId: 'c',
      id: 'b',
      title: "Hashim's birthday",
      allDay: true,
      start: new Date('2026-11-16T00:00'),
      end: new Date('2026-11-17T00:00'),
      editable: true,
    };
    const f = setAllDay(formFromEvent(ev, ['hashim'], false), false);
    expect([f.allDay, f.startDate, f.startTime, f.endDate, f.endTime]).toEqual([
      false,
      '2026-11-16',
      '09:00',
      '2026-11-16',
      '10:00',
    ]);
    expect(formProblem(f)).toBeNull();
    // A timed event keeps its times through a round trip.
    const t = valid({ startTime: '14:00', endTime: '15:30' });
    expect(setAllDay(setAllDay(t, true), false)).toEqual(t);
  });
  it('keeps an event under a day long when the end time changes, and rolls the end day back', () => {
    const late = valid({ startTime: '23:00', endTime: '23:30' });
    const overnight = setEndTime(late, '01:00');
    expect([overnight.endDate, overnight.endTime]).toEqual(['2026-11-07', '01:00']);
    // Changing the mind back: the same evening again, not a 24-hour event.
    const back = setEndTime(overnight, '23:45');
    expect([back.endDate, back.endTime]).toEqual(['2026-11-06', '23:45']);
    expect(formProblem(back)).toBeNull();
    // An overnight event read from Google, shortened to end before midnight.
    const party = setEndTime(valid({ startTime: '20:00', endDate: '2026-11-07', endTime: '02:00' }), '22:30');
    expect([party.endDate, party.endTime]).toEqual(['2026-11-06', '22:30']);
    // An end at the start time is a whole day; moving it on stays within the day after the start.
    const day = setEndTime(valid({ startTime: '09:00', endTime: '10:00' }), '09:00');
    expect([day.endDate, setEndTime(day, '09:30').endDate]).toEqual(['2026-11-07', '2026-11-06']);
  });
  it('keeps the end day of an event set to run longer than a day', () => {
    const visit = valid({ startTime: '15:00', endDate: '2026-11-09', endTime: '11:00' });
    expect(setEndTime(visit, '17:00')).toMatchObject({ endDate: '2026-11-09', endTime: '17:00' });
    const longer = valid({ startTime: '15:00', endDate: '2026-11-07', endTime: '17:00' });
    expect(setEndTime(longer, '18:00')).toMatchObject({ endDate: '2026-11-07', endTime: '18:00' });
  });
  it("writes the event's own reminders back unless the reminder was changed", () => {
    const ev: CalEvent = {
      key: 'c::r',
      calendarId: 'c',
      id: 'r',
      title: 'Dentist',
      allDay: false,
      start: new Date('2026-11-06T16:30'),
      end: new Date('2026-11-06T17:30'),
      editable: true,
      // Google: an email a day before and popups at 10 and 60 minutes; the editor shows the first popup.
      reminderMinutes: 10,
    };
    const f = formFromEvent(ev, ['asiyah'], false);
    expect(f.reminder).toBe('10');
    expect(draftFromForm({ ...f, title: 'Dentist (Asiyah)' }, false).keepReminders).toBe(true);
    expect(draftFromForm({ ...f, reminder: '30' }, false)).toMatchObject({ keepReminders: false, reminderMinutes: 30 });
    expect(draftFromForm({ ...f, reminder: 'none' }, false)).toMatchObject({ keepReminders: false, reminderMinutes: null });
    // A new event has nothing of its own to keep.
    expect(draftFromForm(valid({ reminder: 'none' }), false).keepReminders).toBe(false);
  });
  it('compares repeat rules regardless of weekday order', () => {
    expect(sameRepeat({ every: 1, unit: 'week', weekdays: [4, 6] }, { every: 1, unit: 'week', weekdays: [6, 4] })).toBe(true);
    expect(sameRepeat({ every: 1, unit: 'week', weekdays: [4] }, { every: 1, unit: 'week', weekdays: [4, 6] })).toBe(false);
    expect(sameRepeat({ every: 1, unit: 'day' }, { every: 1, unit: 'day', until: '2026-12-31' })).toBe(false);
    expect(sameRepeat(undefined, { every: 1, unit: 'day' })).toBe(false);
    expect(sameRepeat(undefined, undefined)).toBe(true);
  });
});

describe('event notes', () => {
  const html =
    '<b>Field trip</b><br>Bring:<ul><li>water</li><li>a hat</li></ul>Don&#39;t forget &quot;permission&quot; slips &amp; lunch&nbsp;money.<br>Write &amp;lt;3 on the card.';
  it('shows Google HTML descriptions as plain text', () => {
    expect(plainText(html)).toBe(
      'Field trip\nBring:\n- water\n- a hat\nDon\'t forget "permission" slips & lunch money.\nWrite &lt;3 on the card.',
    );
    expect(plainText('Plain notes stay as they are')).toBe('Plain notes stay as they are');
    expect(plainText('&#x1F382; party &bogus;')).toBe('🎂 party &bogus;');
  });
  const ev: CalEvent = {
    key: 'c::t',
    calendarId: 'c',
    id: 't',
    title: 'Field trip',
    allDay: false,
    start: new Date('2026-11-06T09:00'),
    end: new Date('2026-11-06T15:00'),
    description: html,
    editable: true,
  };
  it('edits the plain text and keeps the original HTML when the notes are not changed', () => {
    const f = formFromEvent(ev, ['asiyah'], false);
    expect(f.notes).toBe(plainText(html));
    expect(draftFromForm({ ...f, title: 'Field trip!' }, false).description).toBe(html);
    expect(draftFromForm({ ...f, notes: 'Only water' }, false).description).toBe('Only water');
    expect(draftFromForm({ ...f, notes: '  ' }, false).description).toBeUndefined();
  });
});
