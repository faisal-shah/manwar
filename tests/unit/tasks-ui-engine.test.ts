import { describe, expect, it } from 'vitest';
import { UP_FOR_GRABS, type Task, type TaskState } from '../../src/data/types';
import { columnOf, forProfile, lastDoneBefore, occurrencesOn, progress, taskStateId } from '../../src/tasks/engine';

/* Foundation changes made for the Tasks UI: claimed Up for Grabs chores move to the claimer's column, and undoing a repeat-after-done completion restores its due date. */

const chore = (p: Partial<Task>): Task => ({
  id: 't',
  kind: 'chore',
  title: 'T',
  assignees: ['a'],
  upForGrabs: false,
  stars: 5,
  date: '2026-11-01',
  order: 0,
  createdAt: 0,
  ...p,
});
const TODAY = '2026-11-04';
const at = (d: string) => new Date(`${d}T12:00:00`).getTime();
const state = (task: Task, date: string, profileId: string, by: string, status: TaskState['status'] = 'done'): TaskState => ({
  id: taskStateId(task.id, date, null, profileId),
  taskId: task.id,
  date,
  part: null,
  profileId,
  by,
  status,
  at: at(TODAY),
  stars: 5,
});
const map = (...s: TaskState[]) => new Map(s.map((x) => [x.id, x]));

describe('Up for Grabs columns', () => {
  const t = chore({ assignees: [], upForGrabs: true, repeat: { every: 1, unit: 'day' } });
  it('puts a claimed chore in the claimer column and counts it there', () => {
    const occ = occurrencesOn(TODAY, [t], map(state(t, TODAY, UP_FOR_GRABS, 'b')), TODAY);
    expect(columnOf(occ[0])).toBe('b');
    expect(forProfile(occ, UP_FOR_GRABS)).toHaveLength(0);
    expect(progress(forProfile(occ, 'b'))).toEqual({ done: 1, total: 1 });
  });
  it('keeps unclaimed and skipped chores in Up for Grabs', () => {
    expect(columnOf(occurrencesOn(TODAY, [t], map(), TODAY)[0])).toBe(UP_FOR_GRABS);
    const skipped = occurrencesOn(TODAY, [t], map(state(t, TODAY, UP_FOR_GRABS, UP_FOR_GRABS, 'skipped')), TODAY);
    expect(columnOf(skipped[0])).toBe(UP_FOR_GRABS);
  });
});

describe('skipped late chores', () => {
  it('stay visible as skipped on the day they were skipped, outside the progress count', () => {
    const t = chore({ repeat: { every: 1, unit: 'week', weekdays: [1, 4] } }); // Mon, Thu; today is Wed
    const late = occurrencesOn(TODAY, [t], map(), TODAY);
    expect(late.map((o) => [o.date, o.lateDays])).toEqual([['2026-11-02', 2]]);
    const s = map(state(t, '2026-11-02', 'a', 'a', 'skipped'));
    const occ = occurrencesOn(TODAY, [t], s, TODAY);
    expect(occ.map((o) => [o.date, o.state?.status])).toEqual([['2026-11-02', 'skipped']]);
    expect(progress(occ)).toEqual({ done: 0, total: 0 });
    expect(occurrencesOn('2026-11-05', [t], s, '2026-11-05').map((o) => o.date)).toEqual(['2026-11-05']);
  });
});

describe('lastDoneBefore', () => {
  /** Complete the shown occurrence today, then undo it with lastDoneBefore, and return what shows. */
  const roundTrip = (t: Task) => {
    const before = occurrencesOn(TODAY, [t], map(), TODAY);
    expect(before).toHaveLength(1);
    const o = before[0];
    const done: Task = { ...t, lastDone: { ...t.lastDone, a: TODAY } };
    expect(occurrencesOn(TODAY, [done], map(state(t, o.date, 'a', 'a')), TODAY)[0].state?.status).toBe('done');
    const prior = lastDoneBefore(done, o.date);
    const { a: _gone, ...rest } = done.lastDone!;
    const undone: Task = { ...done, lastDone: prior ? { ...rest, a: prior } : rest };
    const after = occurrencesOn(TODAY, [undone], map(), TODAY);
    return { before: before.map((x) => [x.date, x.lateDays]), after: after.map((x) => [x.date, x.lateDays]), prior };
  };
  it('restores a first, late occurrence by clearing lastDone', () => {
    const r = roundTrip(chore({ date: '2026-11-03', repeatAfterDone: { every: 2, unit: 'week' } }));
    expect(r.prior).toBeUndefined();
    expect(r.after).toEqual(r.before);
    expect(r.after).toEqual([['2026-11-03', 1]]);
  });
  it('restores a later occurrence by stepping back one interval', () => {
    const r = roundTrip(
      chore({ date: '2026-10-01', repeatAfterDone: { every: 1, unit: 'week' }, lastDone: { a: '2026-10-20' } }),
    );
    expect(r.prior).toBe('2026-10-20');
    expect(r.after).toEqual([['2026-10-27', 8]]);
  });
  it('round-trips monthly intervals, including month-end overflow', () => {
    const t = chore({ date: '2027-01-01', repeatAfterDone: { every: 1, unit: 'month' } });
    // Jan 31 + 1 month overflows to Mar 3 (2027 is not a leap year).
    expect(lastDoneBefore(t, '2027-03-03')).toBe('2027-02-03');
    expect(lastDoneBefore(t, '2027-02-15')).toBe('2027-01-15');
  });
});
