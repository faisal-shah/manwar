import type { HHMM, ISODate, PartOfDay, Repeat, Task, TaskKind } from '../../data/types';

/** The task editor's working copy, and its conversion to and from a Task (pure). */

export type RepeatMode = 'none' | 'schedule' | 'after';
export type AfterUnit = 'day' | 'week' | 'month';

export interface Draft {
  kind: TaskKind;
  title: string;
  emoji?: string;
  assignees: string[];
  upForGrabs: boolean;
  stars: number;
  date: ISODate;
  /** Chores: due time on/off and value. */
  timed: boolean;
  time: HHMM;
  repeatMode: RepeatMode;
  /** Chores on a schedule; routines always. */
  repeat: Repeat;
  after: { every: number; unit: AfterUnit };
  parts: PartOfDay[];
  notes: string;
}

export const MAX_TASK_STARS = 1000;
export const STAR_CHOICES = [0, 1, 2, 5, 10];

export function draftFrom(task: Task | null, todayISO: ISODate, defaultPart: PartOfDay): Draft {
  if (!task)
    return {
      kind: 'chore',
      title: '',
      assignees: [],
      upForGrabs: false,
      stars: 1,
      date: todayISO,
      timed: false,
      time: '09:00',
      repeatMode: 'none',
      repeat: { every: 1, unit: 'day' },
      after: { every: 1, unit: 'week' },
      parts: [defaultPart],
      notes: '',
    };
  return {
    kind: task.kind,
    title: task.title,
    emoji: task.emoji,
    assignees: [...task.assignees],
    upForGrabs: task.upForGrabs,
    stars: task.stars,
    date: task.date,
    timed: !!task.time,
    time: task.time ?? '09:00',
    repeatMode: task.repeatAfterDone ? 'after' : task.repeat ? 'schedule' : 'none',
    repeat: task.repeat ?? { every: 1, unit: 'day' },
    after: task.repeatAfterDone ?? { every: 1, unit: 'week' },
    parts: task.parts?.length ? [...task.parts] : [defaultPart],
    notes: task.notes ?? '',
  };
}

/** Routines repeat by day or week only. */
const routineRepeat = (r: Repeat): Repeat =>
  r.unit === 'day' || r.unit === 'week' ? r : { every: 1, unit: 'day', until: r.until };

/** A user-facing problem with the draft, or null when it can be saved. */
export function validateDraft(d: Draft): string | null {
  if (!d.title.trim()) return 'Give the task a title.';
  if (!(d.kind === 'chore' && d.upForGrabs) && d.assignees.length === 0)
    return d.kind === 'chore' ? 'Choose who it is for, or make it Up for Grabs.' : 'Choose who the routine is for.';
  if (d.kind === 'routine' && d.parts.length === 0) return 'Choose at least one part of the day.';
  if (!Number.isInteger(d.stars) || d.stars < 0 || d.stars > MAX_TASK_STARS)
    return `Stars must be a whole number from 0 to ${MAX_TASK_STARS}.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Choose a date.';
  if (d.kind === 'chore' && d.timed && !/^\d{2}:\d{2}$/.test(d.time)) return 'Choose a time.';
  const r = d.kind === 'routine' ? routineRepeat(d.repeat) : d.repeat;
  if ((d.kind === 'routine' || d.repeatMode === 'schedule') && r.until && r.until < d.date)
    return 'The repeat end date is before the start date.';
  return null;
}

/** Does the edited task keep the completion history (lastDone) it had? Only while it stays repeat-after-done. */
const keepsLastDone = (d: Draft, base: Partial<Task> | null) =>
  d.kind === 'chore' && d.repeatMode === 'after' && !!base?.repeatAfterDone;

const EDITED_FIELDS = [
  'kind',
  'title',
  'emoji',
  'notes',
  'assignees',
  'upForGrabs',
  'stars',
  'date',
  'time',
  'repeat',
  'repeatAfterDone',
  'parts',
] as const satisfies readonly (keyof Task)[];

/**
 * The fields an edit writes. lastDone is left to the check-offs (one on
 * another tablet may have moved it meanwhile) while the chore stays
 * repeat-after-done; otherwise it is deleted, since a completion date from
 * before would date the next occurrence when the chore repeats after done
 * again.
 */
export function savedFields(d: Draft, base: Partial<Task> | null): (keyof Task)[] {
  return keepsLastDone(d, base) ? [...EDITED_FIELDS] : [...EDITED_FIELDS, 'lastDone'];
}

/**
 * The Task to save. Fields that do not apply to the kind are dropped (a
 * routine has no time, Up for Grabs or repeat-after-done; a chore no parts),
 * and the identity, order and archived flag of `base` are kept, with its
 * completion history while it stays repeat-after-done.
 */
export function taskFrom(d: Draft, base: Pick<Task, 'id' | 'order' | 'createdAt'> & Partial<Task>): Task {
  const chore = d.kind === 'chore';
  const ufg = chore && d.upForGrabs;
  return {
    id: base.id,
    kind: d.kind,
    title: d.title.trim(),
    emoji: d.emoji || undefined,
    notes: d.notes.trim() || undefined,
    assignees: ufg ? [] : d.assignees,
    upForGrabs: ufg,
    stars: d.stars,
    date: d.date,
    time: chore && d.timed ? d.time : undefined,
    repeat: chore ? (d.repeatMode === 'schedule' ? d.repeat : undefined) : routineRepeat(d.repeat),
    repeatAfterDone: chore && d.repeatMode === 'after' ? d.after : undefined,
    parts: chore ? undefined : d.parts,
    order: base.order,
    createdAt: base.createdAt,
    archived: base.archived,
    lastDone: keepsLastDone(d, base) ? base.lastDone : undefined,
  };
}
