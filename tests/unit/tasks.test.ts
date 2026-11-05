import { describe, expect, it } from 'vitest';
import { UP_FOR_GRABS, type Task, type TaskState } from '../../src/data/types';
import { HISTORY_DAYS, firstHistoryDay, madeAt, occurrencesOn, partOfDay, progress, taskStateId } from '../../src/tasks/engine';
import { addDays, toISODate } from '../../src/lib/date';

const base = (p: Partial<Task>): Task => ({
  id: 't',
  kind: 'chore',
  title: 'T',
  assignees: ['a'],
  upForGrabs: false,
  stars: 1,
  date: '2026-11-01',
  order: 0,
  createdAt: 0,
  ...p,
});
const done = (task: string, date: string, part: TaskState['part'], profileId: string, at: number): TaskState => ({
  id: taskStateId(task, date, part, profileId),
  taskId: task,
  date,
  part,
  profileId,
  by: profileId,
  status: 'done',
  at,
  stars: 1,
});
const states = (...s: TaskState[]) => new Map(s.map((x) => [x.id, x]));
const TODAY = '2026-11-04';
const noon = (d: string) => new Date(`${d}T12:00:00`).getTime();

describe('task engine', () => {
  it('expands routines per assignee and part', () => {
    const t = base({ kind: 'routine', assignees: ['a', 'b'], parts: ['morning', 'evening'], repeat: { every: 1, unit: 'day' } });
    const occ = occurrencesOn(TODAY, [t], states(), TODAY);
    expect(occ.map((o) => `${o.profileId}:${o.section}`).sort()).toEqual(['a:evening', 'a:morning', 'b:evening', 'b:morning']);
  });
  it('carries a missed one-off chore over as late, only on today', () => {
    const t = base({ date: '2026-11-02' });
    const occ = occurrencesOn(TODAY, [t], states(), TODAY);
    expect(occ).toHaveLength(1);
    expect(occ[0].lateDays).toBe(2);
    expect(occurrencesOn('2026-11-05', [t], states(), TODAY)).toHaveLength(0);
  });
  it('drops a late chore once done, but shows it checked on the day it was done', () => {
    const t = base({ date: '2026-11-02' });
    const s = states(done('t', '2026-11-02', null, 'a', noon(TODAY)));
    const occ = occurrencesOn(TODAY, [t], s, TODAY);
    expect(occ).toHaveLength(1);
    expect(occ[0].state?.status).toBe('done');
    expect(occurrencesOn('2026-11-05', [t], s, '2026-11-05')).toHaveLength(0);
  });
  it('supersedes a missed weekly occurrence with the newer one', () => {
    const t = base({ repeat: { every: 1, unit: 'week', weekdays: [1, 3] } }); // Mon, Wed
    const occ = occurrencesOn(TODAY, [t], states(), TODAY); // Wed
    expect(occ.map((o) => o.date)).toEqual([TODAY]);
    const thu = occurrencesOn('2026-11-05', [t], states(), '2026-11-05');
    expect(thu.map((o) => [o.date, o.lateDays])).toEqual([[TODAY, 1]]);
  });
  it('schedules repeat-after-done chores from the last completion', () => {
    const t = base({ repeatAfterDone: { every: 3, unit: 'day' }, date: '2026-10-01', lastDone: { a: '2026-11-02' } });
    expect(occurrencesOn('2026-11-05', [t], states(), TODAY)).toHaveLength(1);
    expect(occurrencesOn(TODAY, [t], states(), TODAY)).toHaveLength(0);
    const overdue = base({ repeatAfterDone: { every: 1, unit: 'week' }, date: '2026-10-01', lastDone: { a: '2026-10-20' } });
    expect(occurrencesOn(TODAY, [overdue], states(), TODAY)[0].lateDays).toBe(8);
  });
  it('gives Up for Grabs chores a single shared occurrence', () => {
    const t = base({ assignees: [], upForGrabs: true });
    const occ = occurrencesOn('2026-11-01', [t], states(), '2026-11-01');
    expect(occ.map((o) => o.profileId)).toEqual([UP_FOR_GRABS]);
  });
  it('counts progress without skipped items', () => {
    const t = base({ kind: 'routine', parts: ['morning', 'afternoon', 'evening'], repeat: { every: 1, unit: 'day' } });
    const s = states(done('t', TODAY, 'morning', 'a', noon(TODAY)), {
      ...done('t', TODAY, 'evening', 'a', noon(TODAY)),
      status: 'skipped',
    });
    expect(progress(occurrencesOn(TODAY, [t], s, TODAY))).toEqual({ done: 1, total: 2 });
  });
  it('maps times to parts of the day', () => {
    expect(partOfDay(11 * 60 + 59)).toBe('morning');
    expect(partOfDay(12 * 60)).toBe('afternoon');
    expect(partOfDay(18 * 60)).toBe('evening');
  });
});

describe('check-offs filled in for another day', () => {
  const now = new Date('2026-11-04T11:44:30').getTime();
  it('are stamped at the same time of day on that day', () => {
    expect(madeAt(TODAY, now)).toBe(now);
    expect(madeAt('2026-11-03', now)).toBe(new Date('2026-11-03T11:44:30').getTime());
    expect(madeAt('2026-11-05', now)).toBe(new Date('2026-11-05T11:44:30').getTime());
    // Nov 1 2026 is the day US clocks fall back; the stamp still lands on it.
    expect(toISODate(new Date(madeAt('2026-11-01', now)))).toBe('2026-11-01');
  });
  it("stay on their day instead of joining today's list", () => {
    const t = base({ repeat: { every: 1, unit: 'day' } });
    const s = states(done('t', '2026-11-03', null, 'a', madeAt('2026-11-03', now)));
    expect(occurrencesOn(TODAY, [t], s, TODAY).map((o) => o.date)).toEqual([TODAY]);
    expect(occurrencesOn('2026-11-03', [t], s, TODAY).map((o) => o.state?.status)).toEqual(['done']);
    const skipped = states({ ...done('t', '2026-11-05', null, 'a', madeAt('2026-11-05', now)), status: 'skipped' });
    expect(occurrencesOn(TODAY, [t], skipped, TODAY).map((o) => o.date)).toEqual([TODAY]);
  });
  it('keep a late chore checked off from today on today', () => {
    const t = base({ date: '2026-11-02' });
    const s = states(done('t', '2026-11-02', null, 'a', madeAt(TODAY, now)));
    expect(occurrencesOn(TODAY, [t], s, TODAY).map((o) => [o.date, o.state?.status])).toEqual([['2026-11-02', 'done']]);
  });
});

describe('the task history window', () => {
  const first = firstHistoryDay(TODAY);
  it('carries late chores back to its first day and no further', () => {
    expect(first).toBe(addDays(TODAY, -HISTORY_DAYS));
    expect(occurrencesOn(TODAY, [base({ date: first })], states(), TODAY).map((o) => o.lateDays)).toEqual([HISTORY_DAYS]);
    expect(occurrencesOn(TODAY, [base({ date: addDays(first, -1) })], states(), TODAY)).toHaveLength(0);
  });
  it('keeps a long-overdue repeat-after-done chore due on its first day, where its check-off is loaded', () => {
    const t = base({ date: '2026-01-05', repeatAfterDone: { every: 1, unit: 'week' }, lastDone: { a: '2026-02-01' } });
    const occ = occurrencesOn(TODAY, [t], states(), TODAY);
    expect(occ.map((o) => [o.date, o.lateDays])).toEqual([[first, HISTORY_DAYS]]);
    const s = states(done('t', first, null, 'a', noon(TODAY)));
    expect(occurrencesOn(TODAY, [{ ...t, lastDone: { a: TODAY } }], s, TODAY).map((o) => o.state?.status)).toEqual(['done']);
  });
});

describe('late chores across month and year ends', () => {
  it('carries the latest missed occurrence over the boundary', () => {
    const monthly = base({ date: '2026-10-31', repeat: { every: 1, unit: 'month' } });
    // Nov has no 31st; Dec 31 is the latest occurrence before Jan 2.
    expect(occurrencesOn('2027-01-02', [monthly], states(), '2027-01-02').map((o) => [o.date, o.lateDays])).toEqual([
      ['2026-12-31', 2],
    ]);
    const yearly = base({ date: '2025-12-30', repeat: { every: 1, unit: 'year' } });
    expect(occurrencesOn('2027-01-01', [yearly], states(), '2027-01-01').map((o) => [o.date, o.lateDays])).toEqual([
      ['2026-12-30', 2],
    ]);
    const weekly = base({ date: '2026-12-01', repeat: { every: 1, unit: 'week', weekdays: [4] } }); // Thursdays
    expect(occurrencesOn('2027-01-04', [weekly], states(), '2027-01-04').map((o) => [o.date, o.lateDays])).toEqual([
      ['2026-12-31', 4],
    ]);
  });
});
