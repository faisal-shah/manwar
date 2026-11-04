import { describe, expect, it } from 'vitest';
import { UP_FOR_GRABS, type Task, type TaskState } from '../../src/data/types';
import { occurrencesOn, partOfDay, progress, taskStateId } from '../../src/tasks/engine';

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
