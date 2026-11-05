import { describe, expect, it } from 'vitest';
import type { CalEvent } from '../../src/calendar/types';
import { buildAgenda, dayTitle, freeLabel, monthTitle, type AgendaBlock } from '../../src/phone/calendar/agenda';
import { hiddenBy, shownOf, tapPerson } from '../../src/phone/calendar/filter';
import { toggleAssignee } from '../../src/lib/assignees';
import { EVERYONE } from '../../src/data/types';

/** The phone's agenda (src/phone/calendar/agenda.ts). Unit tests run with TZ=America/Chicago. */

const ev = (id: string, start: string, end: string, over: Partial<CalEvent> = {}): CalEvent => ({
  key: `fam::${id}`,
  calendarId: 'fam',
  id,
  title: id,
  allDay: false,
  start: new Date(start),
  end: new Date(end),
  editable: true,
  ...over,
});
const allDay = (id: string, first: string, afterLast: string) => ev(id, `${first}T00:00`, `${afterLast}T00:00`, { allDay: true });
const at = (s: string) => new Date(s).getTime();

const TODAY = '2026-11-04';
const agenda = (events: CalEvent[], from: string, to: string, now = at(`${TODAY}T07:00`), fmt: '12h' | '24h' = '12h') =>
  buildAgenda(events, from, to, now, fmt, TODAY);
const day = (blocks: AgendaBlock[], d: string) => {
  const b = blocks.find((x) => x.kind === 'day' && x.day === d);
  if (!b || b.kind !== 'day') throw new Error(`no day ${d}`);
  return b;
};
const times = (blocks: AgendaBlock[], d: string) => day(blocks, d).rows.map((r) => [r.ev.id, r.start, r.end]);

describe('phone agenda: days and rows', () => {
  it('lists all-day events first, then timed ones by start', () => {
    const blocks = agenda(
      [
        ev('b', `${TODAY}T09:00`, `${TODAY}T10:00`),
        ev('a', `${TODAY}T08:00`, `${TODAY}T08:30`),
        allDay('c', TODAY, '2026-11-05'),
      ],
      TODAY,
      TODAY,
    );
    expect(times(blocks, TODAY)).toEqual([
      ['c', 'All day', null],
      ['a', '8 AM', '8:30 AM'],
      ['b', '9 AM', '10 AM'],
    ]);
    expect(day(blocks, TODAY).rows.map((r) => r.allDay)).toEqual([true, false, false]);
  });

  it('folds days with nothing planned into one line, and always shows today', () => {
    const blocks = agenda([ev('dentist', '2026-11-08T16:30', '2026-11-08T17:30')], TODAY, '2026-11-12');
    expect(blocks.map((b) => (b.kind === 'day' ? `${b.day}:${b.rows.length}` : `${b.from}..${b.to}`))).toEqual([
      '2026-11-04:0',
      '2026-11-05..2026-11-07',
      '2026-11-08:1',
      '2026-11-09..2026-11-12',
    ]);
  });

  it('puts the Now line before the first event still to start, and marks what is over and under way', () => {
    const evs = [
      allDay('trip', TODAY, '2026-11-05'),
      ev('a', `${TODAY}T08:00`, `${TODAY}T08:30`),
      ev('b', `${TODAY}T09:00`, `${TODAY}T10:00`),
      ev('d', `${TODAY}T11:00`, `${TODAY}T12:00`),
    ];
    const today = day(agenda(evs, TODAY, TODAY, at(`${TODAY}T09:30`)), TODAY);
    expect(today.nowAt).toBe(3);
    expect(today.rows.map((r) => [r.ev.id, r.ended, r.current])).toEqual([
      ['trip', false, false],
      ['a', true, false],
      ['b', false, true],
      ['d', false, false],
    ]);
    // After the last event the line closes the day; before the first it opens the timed rows.
    expect(day(agenda(evs, TODAY, TODAY, at(`${TODAY}T23:00`)), TODAY).nowAt).toBe(4);
    expect(day(agenda(evs, TODAY, TODAY, at(`${TODAY}T06:00`)), TODAY).nowAt).toBe(1);
    // No timed events, or another day: no line.
    expect(day(agenda([evs[0]], TODAY, TODAY), TODAY).nowAt).toBeNull();
    const tomorrow = ev('t', '2026-11-05T09:00', '2026-11-05T10:00');
    expect(day(agenda([tomorrow], TODAY, '2026-11-05'), '2026-11-05').nowAt).toBeNull();
  });

  it('shows an all-day event over several days on each of them, counted', () => {
    const grandma = allDay('grandma', '2026-11-12', '2026-11-16');
    const blocks = agenda([grandma], '2026-11-13', '2026-11-20');
    expect(blocks.filter((b) => b.kind === 'day').map((b) => b.kind === 'day' && [b.day, b.rows[0].span])).toEqual([
      ['2026-11-13', 'Day 2 of 4'],
      ['2026-11-14', 'Day 3 of 4'],
      ['2026-11-15', 'Day 4 of 4'],
    ]);
    // A one-day all-day event is not counted.
    expect(day(agenda([allDay('x', TODAY, '2026-11-05')], TODAY, TODAY), TODAY).rows[0].span).toBeNull();
  });

  it('shows an evening event past midnight on both days: its end the next day, then until when it lasts', () => {
    const late = ev('late', `${TODAY}T23:00`, '2026-11-05T01:00');
    const early = ev('early', '2026-11-05T00:30', '2026-11-05T02:00');
    const blocks = agenda([early, late], TODAY, '2026-11-05');
    expect(times(blocks, TODAY)).toEqual([['late', '11 PM', 'Thu 1 AM']]);
    // On the next day it runs from midnight, so it comes first; it is no multi-day event.
    expect(times(blocks, '2026-11-05')).toEqual([
      ['late', 'Until', '1 AM'],
      ['early', '12:30 AM', '2 AM'],
    ]);
    expect(day(blocks, '2026-11-05').rows[0].span).toBeNull();
  });

  it('shows a timed event over several days as all day in between', () => {
    const retreat = ev('retreat', '2026-11-06T15:00', '2026-11-09T11:00');
    const blocks = agenda([retreat], '2026-11-06', '2026-11-09');
    const rows = (['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'] as const).map((d) => day(blocks, d).rows[0]);
    expect(rows.map((r) => [r.start, r.end, r.allDay, r.span])).toEqual([
      ['3 PM', 'Mon 11 AM', false, 'Day 1 of 4'],
      ['All day', null, true, 'Day 2 of 4'],
      ['All day', null, true, 'Day 3 of 4'],
      ['Until', '11 AM', false, 'Day 4 of 4'],
    ]);
  });

  it('puts a zero-length event at its time, with no end', () => {
    const reminder = ev('call', `${TODAY}T14:00`, `${TODAY}T14:00`);
    expect(times(agenda([reminder], TODAY, TODAY), TODAY)).toEqual([['call', '2 PM', null]]);
    // Midnight exactly: on its own day, not the day before.
    const midnight = ev('m', '2026-11-05T00:00', '2026-11-05T00:00');
    expect(times(agenda([midnight], TODAY, '2026-11-05'), '2026-11-05')).toEqual([['m', '12 AM', null]]);
    expect(day(agenda([midnight], TODAY, '2026-11-05'), TODAY).rows).toEqual([]);
  });

  it('keeps wall-clock times and whole days across the clock changes', () => {
    // Clocks go forward at 2 AM on Sunday, March 14, 2027: the daily 9 AM stays at 9 AM.
    const nine = (d: string) => ev(`walk_${d}`, `${d}T09:00`, `${d}T09:30`, { seriesId: 'walk' });
    const night = ev('night', '2027-03-14T01:30', '2027-03-14T03:30');
    const spring = buildAgenda([nine('2027-03-13'), nine('2027-03-14'), night], '2027-03-13', '2027-03-15', 0, '12h', TODAY);
    expect(times(spring, '2027-03-13')).toEqual([['walk_2027-03-13', '9 AM', '9:30 AM']]);
    expect(times(spring, '2027-03-14')).toEqual([
      ['night', '1:30 AM', '3:30 AM'],
      ['walk_2027-03-14', '9 AM', '9:30 AM'],
    ]);
    // Clocks go back at 2 AM on Sunday, November 1, 2026: its 25 hours are one day, the days around it are whole.
    const allNight = ev('vigil', '2026-11-01T00:00', '2026-11-01T23:59');
    const fall = buildAgenda([allNight], '2026-10-31', '2026-11-02', 0, '12h', TODAY);
    expect(fall.map((b) => (b.kind === 'day' ? b.day : `${b.from}..${b.to}`))).toEqual([
      '2026-10-31..2026-10-31',
      '2026-11-01',
      '2026-11-02..2026-11-02',
    ]);
    expect(times(fall, '2026-11-01')).toEqual([['vigil', '12 AM', '11:59 PM']]);
  });

  it('writes times in the household’s 24-hour format', () => {
    const blocks = agenda([ev('a', `${TODAY}T14:00`, `${TODAY}T15:30`)], TODAY, TODAY, at(`${TODAY}T07:00`), '24h');
    expect(times(blocks, TODAY)).toEqual([['a', '14:00', '15:30']]);
  });

  it('busy days keep every event in order', () => {
    const evs = Array.from({ length: 20 }, (_, i) => {
      const h = String(6 + Math.floor(i / 2)).padStart(2, '0');
      const m = i % 2 ? '30' : '00';
      return ev(`e${i}`, `${TODAY}T${h}:${m}`, `${TODAY}T${h}:${m === '00' ? '25' : '55'}`);
    });
    const rows = day(agenda([...evs].reverse(), TODAY, TODAY), TODAY).rows;
    expect(rows.map((r) => r.ev.id)).toEqual(evs.map((e) => e.id));
  });
});

describe('phone agenda: labels', () => {
  it('names the days around today and dates the others, with the year when it is another one', () => {
    expect(dayTitle(TODAY, TODAY)).toEqual({ name: 'Today', date: 'Nov 4' });
    expect(dayTitle('2026-11-05', TODAY)).toEqual({ name: 'Tomorrow', date: 'Nov 5' });
    expect(dayTitle('2026-11-03', TODAY)).toEqual({ name: 'Yesterday', date: 'Nov 3' });
    expect(dayTitle('2026-11-06', TODAY)).toEqual({ name: 'Friday', date: 'Nov 6' });
    expect(dayTitle('2027-01-02', TODAY)).toEqual({ name: 'Saturday', date: 'Jan 2, 2027' });
  });

  it('labels a run of free days and the month being looked at', () => {
    expect(freeLabel('2026-11-12', '2026-11-12')).toBe('Thu, Nov 12');
    expect(freeLabel('2026-11-12', '2026-11-15')).toBe('Thu, Nov 12 - Sun, Nov 15');
    expect(monthTitle('2026-12-20', TODAY)).toBe('December');
    expect(monthTitle('2027-01-02', TODAY)).toBe('January 2027');
  });
});

describe('phone agenda: person filter', () => {
  const all = ['asiyah', 'hashim', 'mamma'];

  it('hides the people not named, and nobody while none is named', () => {
    expect(hiddenBy([], all)).toEqual([]);
    expect(hiddenBy(['hashim'], all)).toEqual(['asiyah', 'mamma']);
    // Someone deleted from the household since: as if not named.
    expect(hiddenBy(['gone'], all)).toEqual([]);
    expect(shownOf(['mamma', 'gone', 'asiyah'], all)).toEqual(['asiyah', 'mamma']);
  });

  it('adds and takes off people by tapping, and comes back to All', () => {
    let shown = tapPerson([], all, 'mamma');
    expect(shown).toEqual(['mamma']);
    shown = tapPerson(shown, all, 'asiyah');
    expect(shown).toEqual(['asiyah', 'mamma']);
    expect(tapPerson(shown, all, 'mamma')).toEqual(['asiyah']);
    // Everyone named is everyone: All.
    expect(tapPerson(shown, all, 'hashim')).toEqual([]);
    expect(tapPerson(['mamma'], all, 'mamma')).toEqual([]);
    expect(tapPerson(shown, all, null)).toEqual([]);
  });
});

describe('assigning people', () => {
  it('toggles a person, and keeps Everyone apart from people', () => {
    expect(toggleAssignee([], 'a')).toEqual(['a']);
    expect(toggleAssignee(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleAssignee(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleAssignee(['a', 'b'], EVERYONE)).toEqual([EVERYONE]);
    expect(toggleAssignee([EVERYONE], 'a')).toEqual(['a']);
    expect(toggleAssignee([EVERYONE], EVERYONE)).toEqual([]);
  });
});
