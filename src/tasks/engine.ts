import { UP_FOR_GRABS, lastDoneKey, type ISODate, type PartOfDay, type Task, type TaskState } from '../data/types';
import { addDays, diffDays, hhmmToMinutes, toISODate } from '../lib/date';
import { lastOccurrenceOnOrBefore, occursOn } from '../lib/repeat';

/**
 * Pure task scheduling. Occurrences are computed from each task's schedule;
 * only their state (done/skipped) is stored.
 *
 * - Routines: one occurrence per assignee per part of the day, on the days
 *   their repeat rule hits.
 * - Scheduled chores: one occurrence per assignee (or one Up for Grabs
 *   occurrence) on each repeat date. On today, the latest missed occurrence
 *   carries over as "N days late" until done, skipped, or superseded by a
 *   newer occurrence.
 * - Repeat-after-done chores: due on task.date, or `every unit` after the
 *   last completion recorded in lastDone; late when overdue.
 * - A chore completed on a day always shows (checked) on that day.
 */

export type Section = PartOfDay | 'chores';
export const SECTIONS: Section[] = ['morning', 'afternoon', 'evening', 'chores'];

export interface Occurrence {
  /** TaskState id for this occurrence. */
  id: string;
  task: Task;
  /** Assignee, or UP_FOR_GRABS. */
  profileId: string;
  /** The date this occurrence was due. */
  date: ISODate;
  part: PartOfDay | null;
  section: Section;
  /** Days overdue when shown on a later day (0 = on time). */
  lateDays: number;
  state?: TaskState;
}

export const taskStateId = (taskId: string, date: ISODate, part: PartOfDay | null, profileId: string) =>
  `${taskId}_${date}_${part ?? 'x'}_${profileId === UP_FOR_GRABS ? 'any' : profileId}`;

/** Part of the day a time falls in: before noon, before 6 PM, after. */
export function partOfDay(minutes: number): PartOfDay {
  return minutes < 12 * 60 ? 'morning' : minutes < 18 * 60 ? 'afternoon' : 'evening';
}

function addUnit(d: ISODate, every: number, unit: 'day' | 'week' | 'month'): ISODate {
  if (unit === 'day') return addDays(d, every);
  if (unit === 'week') return addDays(d, every * 7);
  const [y, m, day] = d.split('-').map(Number);
  return toISODate(new Date(y, m - 1 + every, day));
}

/** Next due date of a repeat-after-done chore for one profile. */
export function afterDoneDue(task: Task, profileId: string): ISODate {
  const last = task.lastDone?.[lastDoneKey(profileId)];
  const r = task.repeatAfterDone!;
  return last ? addUnit(last, r.every, r.unit) : task.date;
}

const owners = (t: Task) => (t.upForGrabs || t.assignees.length === 0 ? [UP_FOR_GRABS] : t.assignees);

/** Every occurrence to show on `day`, given today's date. */
export function occurrencesOn(day: ISODate, tasks: Task[], states: Map<string, TaskState>, todayISO: ISODate): Occurrence[] {
  const out = new Map<string, Occurrence>();
  const add = (task: Task, profileId: string, date: ISODate, part: PartOfDay | null) => {
    const id = taskStateId(task.id, date, part, profileId);
    if (out.has(id)) return;
    out.set(id, {
      id,
      task,
      profileId,
      date,
      part,
      section: part ?? 'chores',
      lateDays: Math.max(0, diffDays(date, day)),
      state: states.get(id),
    });
  };

  for (const task of tasks) {
    if (task.archived) continue;
    if (task.kind === 'routine') {
      if (!occursOn(task.repeat, task.date, day)) continue;
      for (const p of task.assignees)
        for (const part of task.parts?.length ? task.parts : (['morning'] as PartOfDay[])) add(task, p, day, part);
      continue;
    }
    for (const p of owners(task)) {
      if (task.repeatAfterDone) {
        const due = afterDoneDue(task, p);
        if (due === day || (day === todayISO && due < todayISO)) {
          const st = states.get(taskStateId(task.id, due, null, p));
          if (due === day || !st) add(task, p, due, null);
        }
        continue;
      }
      if (occursOn(task.repeat, task.date, day)) {
        add(task, p, day, null);
        continue;
      }
      if (day !== todayISO) continue;
      const last = lastOccurrenceOnOrBefore(task.repeat, task.date, addDays(todayISO, -1), 60);
      if (last && !states.has(taskStateId(task.id, last, null, p))) add(task, p, last, null);
    }
  }

  // Chores completed on this day stay visible (checked) on it.
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const st of states.values()) {
    if (st.status !== 'done' || st.part !== null || toISODate(new Date(st.at)) !== day) continue;
    const task = byId.get(st.taskId);
    if (task && task.kind === 'chore' && !task.archived) add(task, st.profileId, st.date, null);
  }

  return [...out.values()].sort(compareOccurrences);
}

function compareOccurrences(a: Occurrence, b: Occurrence): number {
  const s = SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section);
  if (s) return s;
  const ta = a.task.time ? hhmmToMinutes(a.task.time) : -1;
  const tb = b.task.time ? hhmmToMinutes(b.task.time) : -1;
  return a.task.order - b.task.order || ta - tb || a.task.createdAt - b.task.createdAt;
}

/** Occurrences belonging to a profile's column (Up for Grabs has its own). */
export const forProfile = (occ: Occurrence[], profileId: string) => occ.filter((o) => o.profileId === profileId);

/** done/total for the progress pills; skipped occurrences do not count. */
export function progress(occ: Occurrence[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const o of occ) {
    if (o.state?.status === 'skipped') continue;
    total++;
    if (o.state?.status === 'done') done++;
  }
  return { done, total };
}
