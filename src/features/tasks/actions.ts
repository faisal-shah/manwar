import { signal } from '@preact/signals';
import { asParent } from '../../core/lock';
import { playCheck } from '../../core/sound';
import { data, patch, profileById, remove } from '../../data/store';
import { UP_FOR_GRABS, type Task } from '../../data/types';
import { today } from '../../lib/clock';
import { formatHeaderDate } from '../../lib/date';
import { forProfile, type Occurrence } from '../../tasks/engine';
import { completeTask, occurrencesFor, skipTask, statesById, uncompleteTask } from '../../tasks/state';
import { confirm, toast } from '../../ui/overlays';
import { celebrate, confettiAt, flyStars } from './effects';
import { completionEffects } from './logic';

/**
 * Task actions shared by the Day view, the Week grid and the Home pane.
 * Checking off today's tasks is open to everyone (the kid action); changing
 * another day, skipping, editing and deleting ask for the parent PIN.
 */

/** Up for Grabs chore waiting for "who did it?". */
export const claimRequest = signal<{ o: Occurrence; day: string; origin: DOMRect } | null>(null);
/** Task details popover. */
export const detailsFor = signal<{ o: Occurrence; day: string; anchor: DOMRect } | null>(null);
/** Task editor sheet: a task to edit, 'new', or closed. */
export const editing = signal<Task | 'new' | null>(null);

/** The same occurrence with the current task and state (an Undo pressed after later writes). */
export function fresh(o: Occurrence): Occurrence {
  const task = data.tasks.value.find((t) => t.id === o.task.id) ?? o.task;
  return { ...o, task, state: statesById.value.get(o.id) };
}

/** Tap on a completion circle while viewing `day`. */
export function tapCheck(o: Occurrence, day: string, origin: DOMRect): void {
  if (day > today.value) {
    toast(`That one is for ${formatHeaderDate(day)}. Check it off on the day.`);
    return;
  }
  const run = () => {
    if (o.state?.status === 'done') uncheck(o);
    else if (o.state?.status === 'skipped') unskip(o);
    else if (o.profileId === UP_FOR_GRABS) claimRequest.value = { o, day, origin };
    else complete(o, o.profileId, day, origin);
  };
  if (day < today.value || o.state?.status === 'skipped') void asParent(run, 'Enter the PIN to change another day.');
  else run();
}

/** Check off, with the sound, flying stars, Undo toast and any section or day celebration. */
export function complete(o: Occurrence, by: string, day: string, origin?: DOMRect): void {
  const column = forProfile(occurrencesFor(day), by);
  const fx = completionEffects(column, o);
  void completeTask(o, by);
  playCheck();
  if (origin && o.task.stars > 0) flyStars(origin, by, o.task.stars);
  const who = o.profileId === UP_FOR_GRABS ? ` by ${profileById.value.get(by)?.name ?? 'someone'}` : '';
  toast(`${o.task.title} completed${who}`, { label: 'Undo', run: () => void uncompleteTask(fresh(o)) });
  const p = profileById.value.get(by);
  if (fx.allDone && p) setTimeout(() => celebrate(p.name, p.color, p.emoji), 450);
  else if (fx.sectionDone && p) {
    const btn = document.querySelector<HTMLElement>(`[data-section="${CSS.escape(by)}:${o.section}"]`);
    const rect = btn && btn.offsetParent !== null ? btn.getBoundingClientRect() : origin;
    if (rect) setTimeout(() => confettiAt(rect, p.color), 180);
  }
}

export function uncheck(o: Occurrence): void {
  void uncompleteTask(o);
  toast(
    `${o.task.title} unchecked${o.task.stars ? `, ${o.task.stars} ${o.task.stars === 1 ? 'star' : 'stars'} taken back` : ''}`,
  );
}

export function skip(o: Occurrence): void {
  void asParent(() => {
    void skipTask(o);
    toast(`${o.task.title} skipped`, { label: 'Undo', run: () => unskip(fresh(o)) });
  }, 'Enter the PIN to skip a task.');
}

export function unskip(o: Occurrence): void {
  if (o.state?.status === 'skipped') void remove('taskStates', o.state.id);
}

/** Delete = archive, so history and earned stars stay. */
export function archiveTask(task: Task): void {
  void asParent(async () => {
    const ok = await confirm(`Delete "${task.title}"?`, {
      body: 'It disappears from every day. Stars already earned stay.',
      ok: 'Delete',
      danger: true,
    });
    if (!ok) return;
    void patch('tasks', task.id, { archived: true });
    detailsFor.value = null;
    editing.value = null;
    toast(`Deleted "${task.title}"`, { label: 'Undo', run: () => void patch('tasks', task.id, { archived: false }) });
  }, 'Enter the PIN to delete a task.');
}

export const editTask = (task: Task | 'new') =>
  void asParent(() => {
    detailsFor.value = null;
    editing.value = task;
  }, 'Enter the PIN to add or change tasks.');
