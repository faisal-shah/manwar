import { UP_FOR_GRABS, type ISODate, type PartOfDay, type Profile, type Task, type TaskState } from '../../data/types';
import { addDays, dateAt, formatTime, fromISODate, monthShort, type TimeFormat } from '../../lib/date';
import { describeRepeat, unitName } from '../../lib/repeat';
import { SECTIONS, columnOf, progress, type Occurrence, type Section } from '../../tasks/engine';

/**
 * Pure view logic for the Tasks tab and the Home pane: columns, sections,
 * card subtitles, completion effects and the week grid. No store access.
 */

export const SECTION_META: Record<Section, { label: string; emoji: string }> = {
  morning: { label: 'Morning', emoji: '🌤️' },
  afternoon: { label: 'Afternoon', emoji: '☀️' },
  evening: { label: 'Evening', emoji: '🌙' },
  chores: { label: 'Chores', emoji: '🧹' },
};

export interface TaskFilter {
  /** Profiles whose columns are hidden. */
  hidden: string[];
  upForGrabs: boolean;
  completed: boolean;
  skipped: boolean;
}

export const DEFAULT_FILTER: TaskFilter = { hidden: [], upForGrabs: true, completed: true, skipped: true };

export interface Column {
  /** Profile id, or UP_FOR_GRABS. */
  id: string;
  profile: Profile | null;
  /** Every occurrence in the column (progress counts these). */
  all: Occurrence[];
  /** The ones shown after the completed/skipped filters. */
  occ: Occurrence[];
}

/** Up for Grabs first (only when it has items), then each visible profile. */
export function buildColumns(occ: Occurrence[], profiles: Profile[], f: TaskFilter): Column[] {
  const visible = (o: Occurrence) => (f.completed || o.state?.status !== 'done') && (f.skipped || o.state?.status !== 'skipped');
  const make = (id: string, profile: Profile | null): Column => {
    const all = occ.filter((o) => columnOf(o) === id);
    return { id, profile, all, occ: all.filter(visible) };
  };
  const cols: Column[] = [];
  const ufg = make(UP_FOR_GRABS, null);
  if (f.upForGrabs && ufg.all.length) cols.push(ufg);
  for (const p of profiles) if (!f.hidden.includes(p.id)) cols.push(make(p.id, p));
  return cols;
}

/** Sections that have items, in display order. */
export const sectionsOf = (occ: Occurrence[]): Section[] => SECTIONS.filter((s) => occ.some((o) => o.section === s));

export const sectionProgress = (occ: Occurrence[], s: Section) => progress(occ.filter((o) => o.section === s));

export const isAllDone = (occ: Occurrence[]) => {
  const p = progress(occ);
  return p.total > 0 && p.done === p.total;
};

/**
 * Which sections start expanded. All of them when the household shows every
 * part of the day (or on another day); otherwise the current part plus
 * chores. A finished column collapses to its "All done!" message.
 */
export function defaultExpanded(
  sections: Section[],
  o: { showAll: boolean; isToday: boolean; part: PartOfDay; allDone: boolean },
): Set<Section> {
  if (o.allDone) return new Set();
  if (o.showAll || !o.isToday) return new Set(sections);
  const s = sections.filter((x) => x === o.part || x === 'chores');
  return new Set(s.length ? s : sections.slice(0, 1));
}

/** What checking off `o` finishes in the column it lands in (the claimer's, for Up for Grabs). */
export function completionEffects(column: Occurrence[], o: Occurrence): { sectionDone: boolean; allDone: boolean } {
  const doneState = { ...o.state, status: 'done' } as TaskState;
  const after = [...column.filter((x) => x.id !== o.id), { ...o, state: doneState }];
  const sec = sectionProgress(after, o.section);
  return { sectionDone: sec.total > 0 && sec.done === sec.total, allDone: isAllDone(after) };
}

export const lateLabel = (days: number) => (days === 1 ? '1 day late' : `${days} days late`);

/**
 * Card subtitle: due time and repeat summary, as on the device ("1:30 PM,
 * Daily"). Daily routines show none; other routines show their days.
 */
export function subtitle(task: Task, fmt: TimeFormat): string {
  const parts: string[] = [];
  if (task.kind === 'chore' && task.time) parts.push(formatTime(dateAt(task.date, task.time), fmt));
  const r = repeatSummary(task);
  if (r && !(task.kind === 'routine' && r === 'Daily')) parts.push(r);
  return parts.join(', ');
}

/** "Daily", "Weekly on Mon, Thu", "2 weeks after done"; empty for a one-off chore. */
export function repeatSummary(task: Task): string {
  if (task.repeatAfterDone) {
    const { every, unit } = task.repeatAfterDone;
    return `${every} ${unitName(unit, every)} after done`;
  }
  if (!task.repeat) return '';
  return describeRepeat(task.repeat, task.date);
}

/* ---------- Week grid ---------- */

export type CellStatus = 'done' | 'skipped' | 'missed' | 'open' | 'upcoming';

export interface WeekCell {
  o: Occurrence;
  status: CellStatus;
}

export interface WeekRow {
  key: string;
  task: Task;
  part: PartOfDay | null;
  section: Section;
  cells: (WeekCell | null)[];
}

/**
 * One row per task (and part of day) for one owner (a profile or
 * UP_FOR_GRABS) over `days`. Each occurrence sits on its due date; a chore
 * that was already late before the week starts sits on today. Stored states
 * the schedule no longer produces (repeat-after-done history) are added on
 * their due date.
 */
export function weekRows(
  days: ISODate[],
  byDay: Occurrence[][],
  owner: string,
  todayISO: ISODate,
  states: TaskState[],
  tasks: Map<string, Task>,
): WeekRow[] {
  const placed = new Map<string, { o: Occurrence; i: number }>();
  const index = new Map(days.map((d, i) => [d, i]));
  const place = (o: Occurrence, i: number | undefined) => {
    if (i === undefined || placed.has(o.id)) return;
    placed.set(o.id, { o, i });
  };
  byDay.forEach((list, i) => {
    for (const o of list) {
      if (o.profileId !== owner) continue;
      if (o.date === days[i]) place(o, i);
      else if (index.has(o.date)) place(o, index.get(o.date));
      else if (days[i] === todayISO && o.date < days[0] && !o.state) place(o, i);
    }
  });
  for (const st of states) {
    if (st.profileId !== owner || placed.has(st.id) || !index.has(st.date)) continue;
    const task = tasks.get(st.taskId);
    if (!task || task.archived) continue;
    place(
      { id: st.id, task, profileId: owner, date: st.date, part: st.part, section: st.part ?? 'chores', lateDays: 0, state: st },
      index.get(st.date),
    );
  }

  const rows = new Map<string, WeekRow>();
  for (const { o, i } of placed.values()) {
    const key = `${o.task.id}:${o.part ?? 'x'}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, task: o.task, part: o.part, section: o.section, cells: days.map(() => null) };
      rows.set(key, row);
    }
    const day = days[i];
    const status: CellStatus =
      o.state?.status === 'done'
        ? 'done'
        : o.state?.status === 'skipped'
          ? 'skipped'
          : day < todayISO
            ? 'missed'
            : day === todayISO
              ? 'open'
              : 'upcoming';
    row.cells[i] = { o, status };
  }
  return [...rows.values()].sort(
    (a, b) =>
      SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) ||
      a.task.order - b.task.order ||
      a.task.createdAt - b.task.createdAt,
  );
}

/** "Nov 1 - 7", "Oct 29 - Nov 4". */
export function weekTitle(start: ISODate): string {
  const a = fromISODate(start);
  const b = fromISODate(addDays(start, 6));
  const left = `${monthShort(a.getMonth())} ${a.getDate()}`;
  return a.getMonth() === b.getMonth() ? `${left} - ${b.getDate()}` : `${left} - ${monthShort(b.getMonth())} ${b.getDate()}`;
}
