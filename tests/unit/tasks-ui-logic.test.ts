import { describe, expect, it } from 'vitest';
import { UP_FOR_GRABS, type Profile, type Task, type TaskState } from '../../src/data/types';
import { addDays } from '../../src/lib/date';
import { occurrencesOn, taskStateId } from '../../src/tasks/engine';
import {
  DEFAULT_FILTER,
  buildColumns,
  completionEffects,
  defaultExpanded,
  lateLabel,
  sectionsOf,
  subtitle,
  weekRows,
  weekTitle,
} from '../../src/features/tasks/logic';

const TODAY = '2026-11-04'; // Wednesday
const noon = (d: string) => new Date(`${d}T12:00:00`).getTime();
const profile = (id: string, order: number): Profile => ({ id, name: id, color: '#2D7F86', order, stars: 0, createdAt: 0 });
const people = [profile('a', 0), profile('b', 1)];
let seq = 0;
const task = (p: Partial<Task>): Task => ({
  id: `t${seq++}`,
  kind: 'chore',
  title: 'T',
  assignees: ['a'],
  upForGrabs: false,
  stars: 1,
  date: '2026-11-01',
  order: seq,
  createdAt: 0,
  ...p,
});
const routine = (parts: Task['parts'], p: Partial<Task> = {}) =>
  task({ kind: 'routine', parts, repeat: { every: 1, unit: 'day' }, ...p });
const st = (t: Task, date: string, part: TaskState['part'], profileId: string, extra: Partial<TaskState> = {}): TaskState => ({
  id: taskStateId(t.id, date, part, profileId),
  taskId: t.id,
  date,
  part,
  profileId,
  by: profileId,
  status: 'done',
  at: noon(date),
  stars: 1,
  ...extra,
});
const map = (...s: TaskState[]) => new Map(s.map((x) => [x.id, x]));

describe('buildColumns', () => {
  const ufg = task({ assignees: [], upForGrabs: true, repeat: { every: 1, unit: 'day' } });
  const mine = routine(['morning']);
  it('puts Up for Grabs first only when it has chores', () => {
    const occ = occurrencesOn(TODAY, [ufg, mine], map(), TODAY);
    expect(buildColumns(occ, people, DEFAULT_FILTER).map((c) => c.id)).toEqual([UP_FOR_GRABS, 'a', 'b']);
    const none = occurrencesOn(TODAY, [mine], map(), TODAY);
    expect(buildColumns(none, people, DEFAULT_FILTER).map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('honours hidden profiles, Up for Grabs and the completed filter', () => {
    const occ = occurrencesOn(TODAY, [ufg, mine], map(st(mine, TODAY, 'morning', 'a')), TODAY);
    const cols = buildColumns(occ, people, { ...DEFAULT_FILTER, hidden: ['b'], upForGrabs: false, completed: false });
    expect(cols.map((c) => c.id)).toEqual(['a']);
    expect(cols[0].all).toHaveLength(1);
    expect(cols[0].occ).toHaveLength(0);
  });
  it('moves a claimed Up for Grabs chore to the claimer and hides the empty Up for Grabs column', () => {
    const occ = occurrencesOn(TODAY, [ufg], map(st(ufg, TODAY, null, UP_FOR_GRABS, { by: 'b' })), TODAY);
    const cols = buildColumns(occ, people, DEFAULT_FILTER);
    expect(cols.map((c) => [c.id, c.all.length])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });
});

describe('sections', () => {
  it('lists only sections with items, in order', () => {
    const occ = occurrencesOn(TODAY, [routine(['evening', 'morning']), task({})], map(), TODAY);
    expect(sectionsOf(occ)).toEqual(['morning', 'evening', 'chores']);
  });
  it('expands every section, or just the current part and chores', () => {
    const s = ['morning', 'afternoon', 'evening', 'chores'] as const;
    const base = { showAll: false, isToday: true, part: 'afternoon' as const, allDone: false };
    expect([...defaultExpanded([...s], { ...base, showAll: true })]).toEqual([...s]);
    expect([...defaultExpanded([...s], base)]).toEqual(['afternoon', 'chores']);
    expect([...defaultExpanded([...s], { ...base, isToday: false })]).toEqual([...s]);
    expect([...defaultExpanded(['morning', 'evening'], base)]).toEqual(['morning']);
    expect([...defaultExpanded([...s], { ...base, showAll: true, allDone: true })]).toEqual([]);
  });
});

describe('completionEffects', () => {
  const m1 = routine(['morning']);
  const m2 = routine(['morning']);
  const c1 = task({});
  it('reports a finished section, then a finished day', () => {
    const occ = occurrencesOn(TODAY, [m1, m2, c1], map(st(m1, TODAY, 'morning', 'a')), TODAY);
    const find = (t: Task) => occ.find((o) => o.task.id === t.id)!;
    expect(completionEffects(occ, find(m2))).toEqual({ sectionDone: true, allDone: false });
    const later = occurrencesOn(TODAY, [m1, m2, c1], map(st(m1, TODAY, 'morning', 'a'), st(m2, TODAY, 'morning', 'a')), TODAY);
    expect(
      completionEffects(
        later,
        later.find((o) => o.task.id === c1.id)!,
      ),
    ).toEqual({ sectionDone: true, allDone: true });
  });
  it('ignores skipped items and counts a claimed chore in the claimer column', () => {
    const skipped = occurrencesOn(TODAY, [m1, m2], map(st(m1, TODAY, 'morning', 'a', { status: 'skipped' })), TODAY);
    expect(
      completionEffects(
        skipped,
        skipped.find((o) => o.task.id === m2.id)!,
      ).allDone,
    ).toBe(true);
    const ufg = task({ assignees: [], upForGrabs: true });
    const o = occurrencesOn(TODAY, [ufg], map(), TODAY)[0];
    expect(completionEffects([], o)).toEqual({ sectionDone: true, allDone: true });
  });
});

describe('card text', () => {
  it('shows due time and repeat like the device', () => {
    expect(subtitle(task({ time: '13:30', repeat: { every: 1, unit: 'day' } }), '12h')).toBe('1:30 PM, Daily');
    expect(subtitle(task({ repeatAfterDone: { every: 2, unit: 'week' } }), '12h')).toBe('2 weeks after done');
    expect(subtitle(task({}), '12h')).toBe('');
    expect(subtitle(routine(['morning']), '12h')).toBe('');
    expect(subtitle(routine(['morning'], { repeat: { every: 1, unit: 'week', weekdays: [1, 4] } }), '12h')).toBe(
      'Weekly on Mon, Thu',
    );
    expect(subtitle(task({ time: '07:05' }), '24h')).toBe('07:05');
  });
  it('labels late chores', () => {
    expect(lateLabel(1)).toBe('1 day late');
    expect(lateLabel(4)).toBe('4 days late');
  });
});

describe('weekRows', () => {
  const days = Array.from({ length: 7 }, (_, i) => addDays('2026-11-01', i)); // Sun 1 .. Sat 7
  const rows = (tasks: Task[], states: Map<string, TaskState>, owner = 'a') =>
    weekRows(
      days,
      days.map((d) => occurrencesOn(d, tasks, states, TODAY)),
      owner,
      TODAY,
      [...states.values()],
      new Map(tasks.map((t) => [t.id, t])),
    );
  const statuses = (r: ReturnType<typeof rows>[number]) => r.cells.map((c) => c?.status ?? '-');

  it('marks done, skipped, missed, open and upcoming cells on their days', () => {
    const r = routine(['morning'], { date: '2026-10-01' });
    const s = map(st(r, '2026-11-02', 'morning', 'a'), st(r, '2026-11-03', 'morning', 'a', { status: 'skipped' }));
    expect(statuses(rows([r], s)[0])).toEqual(['missed', 'done', 'skipped', 'open', 'upcoming', 'upcoming', 'upcoming']);
  });
  it('keeps weekday routines blank on other days and sorts by section', () => {
    const eve = routine(['evening']);
    const mwf = routine(['morning'], { repeat: { every: 1, unit: 'week', weekdays: [1, 3, 5] } });
    const out = rows([eve, mwf], map());
    expect(out.map((x) => x.section)).toEqual(['morning', 'evening']);
    expect(statuses(out[0])).toEqual(['-', 'missed', '-', 'open', '-', 'upcoming', '-']);
  });
  it('puts a chore late from before the week on today, and a late one from this week on its day', () => {
    const old = task({ date: '2026-10-28' });
    const recent = task({ date: '2026-11-02' });
    const out = rows([old, recent], map());
    expect(statuses(out.find((x) => x.task.id === old.id)!)).toEqual(['-', '-', '-', 'open', '-', '-', '-']);
    expect(statuses(out.find((x) => x.task.id === recent.id)!)).toEqual(['-', 'missed', '-', '-', '-', '-', '-']);
  });
  it('shows a late chore completed today as done on its due day only', () => {
    const recent = task({ date: '2026-11-02' });
    const s = map(st(recent, '2026-11-02', null, 'a', { at: noon(TODAY) }));
    expect(statuses(rows([recent], s)[0])).toEqual(['-', 'done', '-', '-', '-', '-', '-']);
  });
  it('adds repeat-after-done history the schedule no longer produces', () => {
    const t = task({ date: '2026-10-01', repeatAfterDone: { every: 2, unit: 'week' }, lastDone: { a: TODAY } });
    const s = map(st(t, '2026-11-03', null, 'a', { at: noon(TODAY) }));
    expect(statuses(rows([t], s)[0])).toEqual(['-', '-', 'done', '-', '-', '-', '-']);
  });
  it('keeps Up for Grabs rows to the Up for Grabs owner', () => {
    const ufg = task({ assignees: [], upForGrabs: true, repeat: { every: 1, unit: 'day' } });
    const s = map(st(ufg, TODAY, null, UP_FOR_GRABS, { by: 'b' }));
    expect(rows([ufg], s, 'b')).toHaveLength(0);
    expect(statuses(rows([ufg], s, UP_FOR_GRABS)[0])[3]).toBe('done');
  });
  it('titles the week', () => {
    expect(weekTitle('2026-11-01')).toBe('Nov 1 - 7');
    expect(weekTitle('2026-10-29')).toBe('Oct 29 - Nov 4');
  });
});
