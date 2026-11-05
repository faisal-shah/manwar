import { describe, expect, it } from 'vitest';
import type { CalEvent } from '../../src/calendar/types';
import { capped, isNow, nextUp } from '../../src/phone/today/logic';
import { shownPerson } from '../../src/phone/tasks/logic';
import { UP_FOR_GRABS } from '../../src/data/types';

let seq = 0;
const at = (hhmm: string, day = '2026-11-04') => new Date(`${day}T${hhmm}:00`);
const ev = (title: string, start: Date, end: Date, allDay = false): CalEvent => ({
  key: `k${seq}`,
  calendarId: 'c',
  id: `e${seq++}`,
  title,
  allDay,
  start,
  end,
  editable: true,
});
const timed = (title: string, from: string, to: string, day = '2026-11-04') => ev(title, at(from, day), at(to, day));
const allDay = (title: string, day = '2026-11-04') => ev(title, at('00:00', day), at('00:00', '2026-11-05'), true);

describe('nextUp', () => {
  const school = timed('School', '08:00', '15:00');
  const swim = timed('Swim', '16:00', '17:00');
  const bday = allDay('Birthday');
  const tomorrow = [timed('Dentist', '09:00', '10:00', '2026-11-05')];

  it('shows the rest of today, under way included, and not tomorrow', () => {
    const n = nextUp([bday, school, swim], tomorrow, at('14:30').getTime());
    expect(n.today.allDay.map((e) => e.title)).toEqual(['Birthday']);
    expect(n.today.timed.map((e) => e.title)).toEqual(['School', 'Swim']);
    expect(n.tomorrow).toBeNull();
  });

  it('drops what is over', () => {
    const n = nextUp([school, swim], tomorrow, at('15:00').getTime());
    expect(n.today.timed.map((e) => e.title)).toEqual(['Swim']);
  });

  it('adds tomorrow once nothing timed is left today, keeping today all-day events', () => {
    const n = nextUp([bday, school, swim], tomorrow, at('17:00').getTime());
    expect(n.today.timed).toEqual([]);
    expect(n.today.allDay.map((e) => e.title)).toEqual(['Birthday']);
    expect(n.tomorrow?.timed.map((e) => e.title)).toEqual(['Dentist']);
  });

  it('shows tomorrow on a day without timed events, all of it from its start', () => {
    const early = timed('Early', '06:00', '07:00', '2026-11-05');
    const n = nextUp([], [early], at('23:59').getTime());
    expect(n.tomorrow?.timed.map((e) => e.title)).toEqual(['Early']);
  });

  it('counts an event of a day or longer as all-day', () => {
    const trip = ev('Trip', at('09:00'), at('09:00', '2026-11-06'));
    const n = nextUp([trip], [], at('20:00').getTime());
    expect(n.today.allDay.map((e) => e.title)).toEqual(['Trip']);
    expect(n.tomorrow).not.toBeNull();
  });
});

describe('isNow and capped', () => {
  it('marks only a timed event under way', () => {
    const e = timed('Swim', '16:00', '17:00');
    expect(isNow(e, at('16:00').getTime())).toBe(true);
    expect(isNow(e, at('17:00').getTime())).toBe(false);
    expect(isNow(allDay('Holiday'), at('12:00').getTime())).toBe(false);
  });

  it('keeps a list that fits, and otherwise leaves room for the "more" line', () => {
    expect(capped([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(capped([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], more: 3 });
  });
});

describe('shownPerson', () => {
  it('keeps the stored choice while it is there', () => {
    expect(shownPerson('b', ['a', 'b'], false)).toBe('b');
    expect(shownPerson(UP_FOR_GRABS, ['a'], true)).toBe(UP_FOR_GRABS);
  });

  it('falls back to the first person: a deleted profile, or no Up for Grabs chores today', () => {
    expect(shownPerson('gone', ['a', 'b'], true)).toBe('a');
    expect(shownPerson(UP_FOR_GRABS, ['a'], false)).toBe('a');
    expect(shownPerson(null, ['a'], true)).toBe('a');
  });

  it('shows Up for Grabs with nobody in the household, and nothing without it', () => {
    expect(shownPerson(null, [], true)).toBe(UP_FOR_GRABS);
    expect(shownPerson('a', [], false)).toBeNull();
  });
});
