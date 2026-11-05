import { signal } from '@preact/signals';
import { asParent } from '../../core/lock';
import { playCheck } from '../../core/sound';
import { data, patch, profileById } from '../../data/store';
import { UP_FOR_GRABS, type Task } from '../../data/types';
import { today } from '../../lib/clock';
import { formatHeaderDate } from '../../lib/date';
import { forProfile, type Occurrence } from '../../tasks/engine';
import { completeTask, occurrencesFor, skipTask, statesById, uncompleteTask, unskipTask } from '../../tasks/state';
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

/** A second tap on the same circle this soon is the rest of a double tap, not an uncheck. */
const DOUBLE_TAP_MS = 500;
let lastTap = { id: '', at: -Infinity };

/** Tap on a completion circle while viewing `day`. */
export function tapCheck(tapped: Occurrence, day: string, origin: DOMRect): void {
  const now = performance.now();
  if (tapped.id === lastTap.id && now - lastTap.at < DOUBLE_TAP_MS) return;
  lastTap = { id: tapped.id, at: now };
  if (day > today.value) {
    toast(`That one is for ${formatHeaderDate(day)}. Check it off on the day.`);
    return;
  }
  const o = fresh(tapped);
  const run = () => {
    const cur = fresh(o);
    if (cur.state?.status === 'done') uncheck(cur);
    else if (cur.state?.status === 'skipped') unskip(cur);
    else if (cur.profileId === UP_FOR_GRABS) claimRequest.value = { o: cur, day, origin };
    else complete(cur, cur.profileId, day, origin);
  };
  if (day < today.value || o.state?.status === 'skipped') void asParent(run, 'Enter the PIN to change another day.');
  else run();
}

/*
 * Section and whole-day celebrations play once per profile per day on this
 * device, so unchecking and re-checking the last task does not replay them.
 */
const CELEBRATED_KEY = 'manwar.celebrated.v1';
let celebrated: { day: string; keys: string[] } = (() => {
  try {
    return JSON.parse(localStorage.getItem(CELEBRATED_KEY) ?? '') as { day: string; keys: string[] };
  } catch {
    return { day: '', keys: [] };
  }
})();

/** True the first time `key` is celebrated today (and records it). */
function firstCelebration(key: string): boolean {
  const day = today.value;
  if (celebrated.day !== day) celebrated = { day, keys: [] };
  if (celebrated.keys.includes(key)) return false;
  celebrated = { day, keys: [...celebrated.keys, key] };
  try {
    localStorage.setItem(CELEBRATED_KEY, JSON.stringify(celebrated));
  } catch {
    /* storage unavailable: remembered for this session */
  }
  return true;
}

/** Check off, with the sound, flying stars, Undo toast and any section or day celebration (today only). */
export function complete(o: Occurrence, by: string, day: string, origin?: DOMRect): void {
  const column = forProfile(occurrencesFor(day), by);
  const fx = completionEffects(column, o);
  if (!completeTask(o, by, day)) return;
  playCheck();
  if (origin && o.task.stars > 0) flyStars(origin, by, o.task.stars);
  const who = o.profileId === UP_FOR_GRABS ? ` by ${profileById.value.get(by)?.name ?? 'someone'}` : '';
  toast(`${o.task.title} completed${who}`, { label: 'Undo', run: () => void uncompleteTask(o) });
  const p = profileById.value.get(by);
  if (!p || day !== today.value) return;
  const section = `${by}:${o.section}`;
  if (fx.allDone && firstCelebration(by)) {
    firstCelebration(section);
    setTimeout(() => celebrate(p.name, p.color, p.emoji), 450);
  } else if (fx.sectionDone && firstCelebration(section)) {
    const btn = document.querySelector<HTMLElement>(`[data-section="${CSS.escape(section)}"]`);
    const rect = btn && btn.offsetParent !== null ? btn.getBoundingClientRect() : origin;
    if (rect) setTimeout(() => confettiAt(rect, p.color), 180);
  }
}

export function uncheck(o: Occurrence): void {
  const stars = o.state?.stars ?? 0;
  if (!uncompleteTask(o)) return;
  toast(`${o.task.title} unchecked${stars ? `, ${stars} ${stars === 1 ? 'star' : 'stars'} taken back` : ''}`);
}

export function skip(o: Occurrence, day: string): void {
  void asParent(() => {
    if (!skipTask(o, day)) return;
    toast(`${o.task.title} skipped`, { label: 'Undo', run: () => void unskipTask(o) });
  }, 'Enter the PIN to skip a task.');
}

export function unskip(o: Occurrence): void {
  void unskipTask(o);
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
