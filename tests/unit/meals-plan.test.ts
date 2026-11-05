import { describe, expect, it } from 'vitest';
import type { MealEntry } from '../../src/data/types';
import {
  byCell,
  cellKey,
  editOccurrence,
  formatWeekRange,
  mealOccurrences,
  nextCellOrder,
  nextOccurrenceAfter,
  weekDays,
  weekOf,
  type MealOp,
} from '../../src/features/meals/plan';

const entry = (p: Partial<MealEntry>): MealEntry => ({
  id: 'e',
  date: '2026-11-04',
  category: 'dinner',
  title: 'Pizza',
  order: 0,
  createdAt: 0,
  ...p,
});
const ids = () => {
  let n = 0;
  return () => `new${++n}`;
};
/** Apply ops to an in-memory collection, for checking outcomes. */
function apply(entries: MealEntry[], ops: MealOp[]): MealEntry[] {
  const m = new Map(entries.map((e) => [e.id, e]));
  for (const o of ops) {
    if (o.op === 'put') m.set(o.entry.id, o.entry);
    else if (o.op === 'remove') m.delete(o.id);
    else m.set(o.id, { ...m.get(o.id)!, ...o.data });
  }
  return [...m.values()];
}
const datesOf = (entries: MealEntry[], from: string, to: string) =>
  mealOccurrences(entries, from, to).map((o) => `${o.date.slice(8)}:${o.entry.title}`);

describe('week window', () => {
  it('starts on the configured weekday and pages by weeks', () => {
    expect(weekOf('2026-11-04', 0)).toBe('2026-11-01');
    expect(weekOf('2026-11-04', 1)).toBe('2026-11-02');
    expect(weekOf('2026-11-01', 1)).toBe('2026-10-26');
    expect(weekOf('2026-11-04', 0, 1)).toBe('2026-11-08');
    expect(weekOf('2026-11-04', 0, -1)).toBe('2026-10-25');
    expect(weekDays('2026-11-01')).toHaveLength(7);
    expect(weekDays('2026-11-01')[6]).toBe('2026-11-07');
  });

  it('pages across a year boundary', () => {
    expect(weekOf('2026-12-30', 0, 1)).toBe('2027-01-03');
    expect(formatWeekRange('2026-12-27', 2026)).toBe('Dec 27 - Jan 2, 2027');
    expect(formatWeekRange('2026-11-08', 2026)).toBe('Nov 8 - 14');
    expect(formatWeekRange('2026-11-29', 2026)).toBe('Nov 29 - Dec 5');
  });
});

describe('mealOccurrences', () => {
  it('places one-off entries on their date only', () => {
    expect(datesOf([entry({})], '2026-11-01', '2026-11-07')).toEqual(['04:Pizza']);
    expect(datesOf([entry({})], '2026-11-05', '2026-11-07')).toEqual([]);
  });

  it('repeats weekly on chosen weekdays, from the start date, until the end', () => {
    const e = entry({ repeat: { every: 1, unit: 'week', weekdays: [1, 5] }, date: '2026-11-03' });
    expect(datesOf([e], '2026-11-01', '2026-11-14')).toEqual(['06:Pizza', '09:Pizza', '13:Pizza']);
    const ended = entry({ repeat: { every: 1, unit: 'week', weekdays: [5], until: '2026-11-10' } });
    expect(datesOf([ended], '2026-11-01', '2026-11-30')).toEqual(['06:Pizza']);
  });

  it('orders entries within a day by cell order', () => {
    const a = entry({ id: 'a', title: 'B', order: 1 });
    const b = entry({ id: 'b', title: 'A', order: 0, repeat: { every: 1, unit: 'day' }, date: '2026-11-01' });
    expect(datesOf([a, b], '2026-11-04', '2026-11-04')).toEqual(['04:A', '04:B']);
    const cells = byCell(mealOccurrences([a, b], '2026-11-03', '2026-11-04'));
    expect(cells.get(cellKey('2026-11-04', 'dinner'))!.map((e) => e.id)).toEqual(['b', 'a']);
    expect(cells.get(cellKey('2026-11-03', 'dinner'))!.map((e) => e.id)).toEqual(['b']);
    expect(nextCellOrder([a, b], '2026-11-04', 'dinner')).toBe(2);
    expect(nextCellOrder([a, b], '2026-11-04', 'lunch')).toBe(0);
  });
});

describe('editOccurrence', () => {
  const weekly = entry({ id: 's', date: '2026-11-06', repeat: { every: 1, unit: 'week', weekdays: [5] } }); // Fridays

  it('removes or replaces a one-off entry whatever the scope', () => {
    expect(editOccurrence(entry({}), '2026-11-04', 'one', null, ids())).toEqual([{ op: 'remove', id: 'e' }]);
    const ops = editOccurrence(entry({}), '2026-11-04', 'one', { title: 'Tacos' }, ids());
    expect(apply([entry({})], ops).map((e) => e.title)).toEqual(['Tacos']);
  });

  it('removes one Friday and keeps the rest', () => {
    const after = apply([weekly], editOccurrence(weekly, '2026-11-13', 'one', null, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-30')).toEqual(['06:Pizza', '20:Pizza', '27:Pizza']);
  });

  it('removes the first occurrence by moving the start', () => {
    const ops = editOccurrence(weekly, '2026-11-06', 'one', null, ids());
    expect(ops).toEqual([{ op: 'patch', id: 's', data: { date: '2026-11-13' } }]);
  });

  it('changes one Friday into a one-off', () => {
    const after = apply([weekly], editOccurrence(weekly, '2026-11-13', 'one', { title: 'Tacos' }, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-30')).toEqual(['06:Pizza', '13:Tacos', '20:Pizza', '27:Pizza']);
    expect(after.find((e) => e.title === 'Tacos')!.repeat).toBeUndefined();
  });

  it('changes this and following', () => {
    const after = apply([weekly], editOccurrence(weekly, '2026-11-20', 'following', { title: 'Tacos' }, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-30')).toEqual(['06:Pizza', '13:Pizza', '20:Tacos', '27:Tacos']);
    const first = apply([weekly], editOccurrence(weekly, '2026-11-06', 'following', { title: 'Tacos' }, ids()));
    expect(first.map((e) => e.id)).toEqual(['s']);
  });

  it('ends the series for "this and following" removal', () => {
    const after = apply([weekly], editOccurrence(weekly, '2026-11-20', 'following', null, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-30')).toEqual(['06:Pizza', '13:Pizza']);
    expect(editOccurrence(weekly, '2026-11-06', 'following', null, ids())).toEqual([{ op: 'remove', id: 's' }]);
  });

  it('edits every occurrence with scope all', () => {
    const after = apply([weekly], editOccurrence(weekly, '2026-11-20', 'all', { title: 'Tacos' }, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-14')).toEqual(['06:Tacos', '13:Tacos']);
  });

  // As the Plan meal sheet makes them: weekly with the weekday spelled out.
  const fridays = entry({ id: 's', date: '2026-11-06', repeat: { every: 1, unit: 'week', weekdays: [5] } });

  it('moves this and following to the new weekday', () => {
    const after = apply([fridays], editOccurrence(fridays, '2026-11-13', 'following', { date: '2026-11-14' }, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-30')).toEqual(['06:Pizza', '14:Pizza', '21:Pizza', '28:Pizza']);
  });

  it('moves every occurrence by the same number of days', () => {
    const after = apply([fridays], editOccurrence(fridays, '2026-11-13', 'all', { date: '2026-11-14' }, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-30')).toEqual(['07:Pizza', '14:Pizza', '21:Pizza', '28:Pizza']);
    const monthly = entry({ id: 'm', date: '2026-10-15', repeat: { every: 1, unit: 'month' } });
    const later = apply([monthly], editOccurrence(monthly, '2026-11-15', 'all', { date: '2026-11-17' }, ids()));
    expect(datesOf(later, '2026-10-01', '2026-12-31')).toEqual(['17:Pizza', '17:Pizza', '17:Pizza']);
  });

  it('keeps a repeat chosen in the same edit as given', () => {
    const weekdays = { every: 1, unit: 'week' as const, weekdays: [1 as const, 3 as const] };
    const after = apply(
      [fridays],
      editOccurrence(fridays, '2026-11-13', 'following', { date: '2026-11-16', repeat: weekdays }, ids()),
    );
    expect(datesOf(after, '2026-11-01', '2026-11-21')).toEqual(['06:Pizza', '16:Pizza', '18:Pizza']);
  });

  it('turning the repeat off for every time leaves one meal on the day being edited', () => {
    const after = apply([fridays], editOccurrence(fridays, '2026-11-20', 'all', { repeat: undefined }, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-30')).toEqual(['20:Pizza']);
  });

  it('respects until when continuing a series', () => {
    const short = entry({ id: 's', date: '2026-11-06', repeat: { every: 1, unit: 'week', weekdays: [5], until: '2026-11-13' } });
    expect(nextOccurrenceAfter(short, '2026-11-13')).toBeNull();
    const after = apply([short], editOccurrence(short, '2026-11-13', 'one', null, ids()));
    expect(datesOf(after, '2026-11-01', '2026-11-30')).toEqual(['06:Pizza']);
  });
});
