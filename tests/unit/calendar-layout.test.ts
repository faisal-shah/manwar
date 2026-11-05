import { describe, expect, it } from 'vitest';
import {
  countLabel,
  focusForView,
  layoutLanes,
  layoutMonthWeek,
  miniMonthDays,
  monthSpan,
  packRows,
  pageFocus,
  periodTitle,
  rangeLabel,
  viewPeriod,
  type NavSettings,
} from '../../src/features/calendar/layout';

const S: NavSettings = {
  weekStart: 0,
  scheduleDays: 4,
  scheduleStartToday: true,
  weekStartToday: false,
  monthStartCurrentWeek: false,
};
const TODAY = '2026-11-04'; // a Wednesday

type Ev = { id: string; s: number; e: number };
const lanes = (evs: Ev[]) =>
  Object.fromEntries(
    layoutLanes(
      evs,
      (x) => x.s,
      (x) => x.e,
    ).map((p) => [p.item.id, [p.lane, p.lanes]]),
  );

describe('layoutLanes', () => {
  it('keeps separate and back-to-back events full width', () => {
    expect(
      lanes([
        { id: 'a', s: 600, e: 615 },
        { id: 'b', s: 615, e: 630 },
        { id: 'c', s: 700, e: 760 },
      ]),
    ).toEqual({ a: [0, 1], b: [0, 1], c: [0, 1] });
  });
  it('splits concurrent events evenly (Nap + Quran class on Sat)', () => {
    expect(
      lanes([
        { id: 'nap', s: 900, e: 960 },
        { id: 'quran', s: 900, e: 960 },
      ]),
    ).toEqual({ nap: [0, 2], quran: [1, 2] });
  });
  it('reuses a freed lane inside a chained cluster and shares the lane count', () => {
    expect(
      lanes([
        { id: 'a', s: 0, e: 60 },
        { id: 'b', s: 30, e: 90 },
        { id: 'c', s: 60, e: 120 },
      ]),
    ).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] });
  });
  it('uses three lanes for a three-way overlap and puts the longest first', () => {
    expect(
      lanes([
        { id: 'short', s: 0, e: 30 },
        { id: 'long', s: 0, e: 120 },
        { id: 'mid', s: 10, e: 50 },
      ]),
    ).toEqual({ long: [0, 3], short: [1, 3], mid: [2, 3] });
  });
  it('gives zero-length events a sliver so they still collide', () => {
    expect(
      lanes([
        { id: 'a', s: 60, e: 60 },
        { id: 'b', s: 60, e: 90 },
      ]),
    ).toEqual({ b: [0, 2], a: [1, 2] });
  });
});

describe('packRows', () => {
  it('puts bars on the first row they fit', () => {
    expect(
      packRows([
        { from: 0, to: 2 },
        { from: 1, to: 1 },
        { from: 3, to: 6 },
        { from: 2, to: 3 },
      ]),
    ).toEqual([0, 1, 0, 1]);
  });
});

describe('layoutMonthWeek', () => {
  const empty = () => Array.from({ length: 7 }, () => [] as string[]);
  it('shows three items without a "more" line', () => {
    const s = empty();
    s[3] = ['a', 'b', 'c'];
    const l = layoutMonthWeek([], s);
    expect(l.singles).toEqual([
      { id: 'a', col: 3, line: 0 },
      { id: 'b', col: 3, line: 1 },
      { id: 'c', col: 3, line: 2 },
    ]);
    expect(l.more).toEqual([]);
  });
  it('shows two items and "N more" when a day has more than three', () => {
    const s = empty();
    s[0] = ['a', 'b', 'c', 'd', 'e'];
    const l = layoutMonthWeek([], s);
    expect(l.singles.map((x) => x.id)).toEqual(['a', 'b']);
    expect(l.more).toEqual([{ col: 0, line: 2, count: 3 }]);
  });
  it('keeps a multi-day bar on one line and fills singles around it', () => {
    const s = empty();
    s[2] = ['x', 'y', 'z'];
    const l = layoutMonthWeek([{ id: 'trip', from: 1, to: 3 }], s);
    expect(l.bars).toEqual([{ id: 'trip', col0: 1, col1: 3, line: 0, startsHere: true, endsHere: true }]);
    expect(l.singles).toEqual([{ id: 'x', col: 2, line: 1 }]);
    expect(l.more).toEqual([{ col: 2, line: 2, count: 2 }]);
  });
  it('splits a bar hidden by one overflowing day and counts it in "more"', () => {
    const s = empty();
    s[1] = ['solo'];
    const bars = [
      { id: 'A', from: 0, to: 2 },
      { id: 'B', from: 0, to: 2 },
      { id: 'C', from: 0, to: 4 },
    ];
    const l = layoutMonthWeek(bars, s);
    // Longest first: C line 0, A line 1, B line 2.
    expect(l.bars.filter((b) => b.id === 'C')).toEqual([
      { id: 'C', col0: 0, col1: 4, line: 0, startsHere: true, endsHere: true },
    ]);
    expect(l.bars.filter((b) => b.id === 'B')).toEqual([
      { id: 'B', col0: 0, col1: 0, line: 2, startsHere: true, endsHere: false },
      { id: 'B', col0: 2, col1: 2, line: 2, startsHere: false, endsHere: true },
    ]);
    expect(l.singles).toEqual([]);
    expect(l.more).toEqual([{ col: 1, line: 2, count: 2 }]);
  });
  it('marks bars that continue from or into the neighbouring week', () => {
    const l = layoutMonthWeek([{ id: 'v', from: 0, to: 6, contStart: true, contEnd: true }], empty());
    expect(l.bars).toEqual([{ id: 'v', col0: 0, col1: 6, line: 0, startsHere: false, endsHere: false }]);
  });
});

describe('viewPeriod and paging', () => {
  it('Schedule starts today for N days, or on the week start', () => {
    expect(viewPeriod('schedule', null, TODAY, S)).toEqual({ from: '2026-11-04', to: '2026-11-07' });
    expect(viewPeriod('schedule', null, TODAY, { ...S, scheduleStartToday: false, scheduleDays: 7 })).toEqual({
      from: '2026-11-01',
      to: '2026-11-07',
    });
    expect(viewPeriod('schedule', null, TODAY, { ...S, weekStart: 1, scheduleStartToday: false })).toEqual({
      from: '2026-11-02',
      to: '2026-11-05',
    });
  });
  it('Schedule on the week start still shows today late in the week', () => {
    const fewer = { ...S, weekStart: 1 as const, scheduleStartToday: false };
    // Saturday: four days from Monday would end on Thursday.
    expect(viewPeriod('schedule', null, '2026-11-07', fewer)).toEqual({ from: '2026-11-04', to: '2026-11-07' });
    expect(viewPeriod('schedule', null, '2026-11-08', { ...fewer, scheduleDays: 1 })).toEqual({
      from: '2026-11-08',
      to: '2026-11-08',
    });
    // Paging away and back returns to the period with today.
    const next = pageFocus('schedule', null, '2026-11-07', fewer, 1);
    expect(next).toBe('2026-11-08');
    expect(pageFocus('schedule', next, '2026-11-07', fewer, -1)).toBeNull();
  });
  it('Schedule pages by its day count and returns to following today', () => {
    const next = pageFocus('schedule', null, TODAY, S, 1);
    expect(next).toBe('2026-11-08');
    expect(viewPeriod('schedule', next, TODAY, S)).toEqual({ from: '2026-11-08', to: '2026-11-11' });
    expect(pageFocus('schedule', next, TODAY, S, -1)).toBeNull();
  });
  it('Week aligns to the week start unless it starts today', () => {
    expect(viewPeriod('week', null, TODAY, S)).toEqual({ from: '2026-11-01', to: '2026-11-07' });
    expect(viewPeriod('week', null, TODAY, { ...S, weekStartToday: true })).toEqual({ from: '2026-11-04', to: '2026-11-10' });
    expect(pageFocus('week', null, TODAY, S, 1)).toBe('2026-11-08');
    expect(pageFocus('week', null, TODAY, S, -1)).toBe('2026-10-25');
  });
  it('Day pages one day at a time', () => {
    expect(pageFocus('day', null, TODAY, S, 1)).toBe('2026-11-05');
    expect(pageFocus('day', '2026-11-05', TODAY, S, -1)).toBeNull();
  });
  it('Month covers whole weeks of the month', () => {
    expect(viewPeriod('month', null, TODAY, S)).toEqual({ from: '2026-11-01', to: '2026-12-05', month: '2026-11-01' });
    expect(viewPeriod('month', '2026-12-01', TODAY, S)).toEqual({ from: '2026-11-29', to: '2027-01-02', month: '2026-12-01' });
    // January 2027 needs six rows (Fri 1st to Sun 31st).
    expect(viewPeriod('month', '2027-01-01', TODAY, S)).toEqual({ from: '2026-12-27', to: '2027-02-06', month: '2027-01-01' });
    expect(viewPeriod('month', '2026-11-20', TODAY, { ...S, weekStart: 1 }).from).toBe('2026-10-26');
  });
  it('Month pages across the year boundary and back', () => {
    const dec = pageFocus('month', null, TODAY, S, 1);
    const jan = pageFocus('month', dec, TODAY, S, 1);
    expect([dec, jan]).toEqual(['2026-12-01', '2027-01-01']);
    expect(periodTitle('month', viewPeriod('month', jan, TODAY, S), TODAY)).toBe('January 2027');
    const back = pageFocus('month', pageFocus('month', jan, TODAY, S, -1), TODAY, S, -1);
    expect(back).toBeNull();
    // Paging forward from a 31st lands on the next month, not two ahead.
    expect(pageFocus('month', '2027-01-31', TODAY, S, 1)).toBe('2027-02-01');
  });
  it('Month can start on the current week', () => {
    const s = { ...S, monthStartCurrentWeek: true };
    expect(viewPeriod('month', null, '2026-11-18', s)).toEqual({ from: '2026-11-15', to: '2026-12-19', month: '2026-11-01' });
    // Other months keep the normal grid.
    expect(viewPeriod('month', '2026-12-01', '2026-11-18', s).from).toBe('2026-11-29');
  });
});

describe('titles and labels', () => {
  it('shows nothing while the period has today, then the month(s) or the date', () => {
    expect(periodTitle('schedule', viewPeriod('schedule', null, TODAY, S), TODAY)).toBeNull();
    expect(periodTitle('schedule', { from: '2026-11-29', to: '2026-12-02' }, TODAY)).toBe('Nov - Dec 2026');
    expect(periodTitle('week', { from: '2026-12-27', to: '2027-01-02' }, TODAY)).toBe('Dec 2026 - Jan 2027');
    expect(periodTitle('day', { from: '2026-11-06', to: '2026-11-06' }, TODAY)).toBe('Fri, Nov 6, 2026');
    expect(periodTitle('month', viewPeriod('month', null, TODAY, S), TODAY)).toBeNull();
    expect(periodTitle('month', viewPeriod('month', '2026-10-01', TODAY, S), TODAY)).toBe('October 2026');
  });
  it('formats spans, ranges and counts', () => {
    expect(monthSpan('2026-11-08', '2026-11-14')).toBe('November 2026');
    expect(rangeLabel('2026-11-08', '2026-11-14')).toBe('November 8 - 14');
    expect(rangeLabel('2026-11-29', '2026-12-05')).toBe('November 29 - December 5');
    expect([countLabel(0, false), countLabel(1, false), countLabel(4, false), countLabel(12, true)]).toEqual([
      'No events',
      '1 event',
      '4 events',
      '12 events today',
    ]);
  });
  it('keeps the place in time when switching views', () => {
    expect(focusForView('month', 'week', '2026-12-01', TODAY, S)).toBe('2026-11-29');
    expect(focusForView('week', 'month', '2026-12-06', TODAY, S)).toBe('2026-12-01');
    expect(focusForView('day', 'schedule', '2026-11-05', TODAY, S)).toBeNull();
    expect(focusForView('day', 'week', '2026-11-12', TODAY, S)).toBe('2026-11-08');
    expect(focusForView('schedule', 'day', null, TODAY, S)).toBeNull();
  });
  it('lays out a 6-week mini month from the week start', () => {
    const d = miniMonthDays('2026-11-01', 1);
    expect([d.length, d[0], d[41]]).toEqual([42, '2026-10-26', '2026-12-06']);
  });
});
