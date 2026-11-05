import type { EventMeta, Reward, TabId, Task } from '../../data/types';

/* ---------- Tabs ---------- */

/** Home and Calendar are the wall's landing tabs: at least one stays on. */
const LANDING: TabId[] = ['home', 'calendar'];

export function canHideTab(hidden: TabId[], id: TabId): boolean {
  if (hidden.includes(id)) return true;
  if (!LANDING.includes(id)) return true;
  return LANDING.filter((t) => t !== id).some((t) => !hidden.includes(t));
}

/** The new hidden-tab list after showing or hiding one tab (unchanged when the rule forbids it). */
export function setTabShown(hidden: TabId[], id: TabId, shown: boolean): TabId[] {
  if (shown) return hidden.filter((t) => t !== id);
  if (hidden.includes(id) || !canHideTab(hidden, id)) return hidden;
  return [...hidden, id];
}

/** Where the wall goes when the open tab is hidden: the first landing tab still shown. */
export function fallbackTab(hidden: TabId[]): TabId {
  return LANDING.find((t) => !hidden.includes(t)) ?? 'calendar';
}

/* ---------- Profiles ---------- */

/** Another profile already has this name (trimmed, any case): columns and pickers would show two alike. */
export function nameTaken(name: string, others: { id: string; name: string }[], self?: string): boolean {
  const n = name.trim().toLocaleLowerCase();
  return others.some((p) => p.id !== self && p.name.trim().toLocaleLowerCase() === n);
}

/** Move the item at `from` to `to`, returning the new order of ids. */
export function moveId(ids: string[], from: number, to: number): string[] {
  if (to < 0 || to >= ids.length || from === to) return ids;
  const out = [...ids];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** A quick run of Move taps on one spot: which row it moves, which way, where the finger is, and when. */
export interface MoveRun {
  id: string;
  dir: -1 | 1;
  spot: number;
  at: number;
}

/** Taps on one spot this close together are one run. */
export const MOVE_RUN_MS = 800;

/**
 * Which row a Move up or down tap moves. A moved row takes its buttons with
 * it, so the next tap on the same spot lands on the neighbour that took its
 * place: within a quick run of taps on one spot (same direction), the tap
 * goes on moving the row the run started with. Returns the index to move
 * and the run to remember.
 */
export function moveTarget(
  ids: string[],
  tapped: number,
  dir: -1 | 1,
  run: MoveRun | null,
  now: number,
): { index: number; run: MoveRun } {
  const same = run && run.dir === dir && run.spot === tapped && now - run.at < MOVE_RUN_MS;
  const index = same ? ids.indexOf(run.id) : -1;
  if (same && index >= 0) return { index, run: { ...run, at: now } };
  return { index: tapped, run: { id: ids[tapped], dir, spot: tapped, at: now } };
}

export interface ProfileDeletePlan {
  /** Tasks only this profile had: archived. */
  archiveTasks: string[];
  /** Shared tasks: the profile is taken off. */
  unassignTasks: { id: string; assignees: string[] }[];
  /** Rewards only this profile could redeem: archived. */
  archiveRewards: string[];
  /** Rewards limited to several profiles: the profile is taken off. */
  unassignRewards: { id: string; profiles: string[] }[];
  /** Event assignments: the profile is taken off (events left with nobody go back to triage). */
  eventMeta: { id: string; profiles: string[] }[];
}

/**
 * What deleting a profile changes. Star history (ledger) and completed task
 * states are kept as history; everything that would still point at the
 * profile is archived or unassigned.
 */
export function planProfileDelete(
  id: string,
  { tasks, rewards, eventMeta }: { tasks: Task[]; rewards: Reward[]; eventMeta: EventMeta[] },
): ProfileDeletePlan {
  const plan: ProfileDeletePlan = { archiveTasks: [], unassignTasks: [], archiveRewards: [], unassignRewards: [], eventMeta: [] };
  for (const t of tasks) {
    if (!t.assignees.includes(id)) continue;
    const rest = t.assignees.filter((a) => a !== id);
    if (rest.length) plan.unassignTasks.push({ id: t.id, assignees: rest });
    else if (!t.archived) plan.archiveTasks.push(t.id);
  }
  for (const r of rewards) {
    if (!r.profiles.includes(id)) continue;
    const rest = r.profiles.filter((p) => p !== id);
    if (rest.length) plan.unassignRewards.push({ id: r.id, profiles: rest });
    else if (!r.archived) plan.archiveRewards.push(r.id);
  }
  for (const m of eventMeta) {
    if (m.profiles.includes(id)) plan.eventMeta.push({ id: m.id, profiles: m.profiles.filter((p) => p !== id) });
  }
  return plan;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The confirm text that explains a deletion before it happens. */
export function describeProfileDelete(name: string, plan: ProfileDeletePlan): string {
  const parts: string[] = [];
  if (plan.archiveTasks.length) parts.push(`${plural(plan.archiveTasks.length, 'task')} only ${name} had will be archived.`);
  const shared = plan.unassignTasks.length + plan.unassignRewards.length;
  if (shared) parts.push(`${name} is taken off ${plural(shared, 'shared task or reward', 'shared tasks and rewards')}.`);
  if (plan.archiveRewards.length)
    parts.push(`${plural(plan.archiveRewards.length, 'reward')} only ${name} could redeem will be archived.`);
  const alone = plan.eventMeta.filter((m) => m.profiles.length === 0).length;
  if (plan.eventMeta.length)
    parts.push(
      `${name} is removed from ${plural(plan.eventMeta.length, 'event')}` +
        (alone ? `; ${plural(alone, 'event')} assigned only to ${name} will wait in the unassigned queue.` : '.'),
    );
  parts.push('Star history stays in the ledger. This cannot be undone.');
  return parts.join(' ');
}

/* ---------- PIN ---------- */

export const isPin = (s: string) => /^\d{4}$/.test(s);
