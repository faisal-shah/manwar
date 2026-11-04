import { computed } from '@preact/signals';
import { deleteField } from 'firebase/firestore';
import { batch, data, newId, profileById, profiles } from '../data/store';
import {
  UP_FOR_GRABS,
  lastDoneKey,
  type ISODate,
  type LedgerEntry,
  type LedgerReason,
  type Reward,
  type Task,
  type TaskState,
} from '../data/types';
import { currentTime, today } from '../lib/clock';
import { toISODate } from '../lib/date';
import { forProfile, lastDoneBefore, occurrencesOn, progress, type Occurrence } from './engine';

/** Reactive views of the task engine over the live store. */

export const statesById = computed(() => new Map(data.taskStates.value.map((s) => [s.id, s])));

export function occurrencesFor(day: ISODate): Occurrence[] {
  return occurrencesOn(day, data.tasks.value, statesById.value, today.value);
}

export const todayOccurrences = computed(() => occurrencesFor(today.value));

/** done/total for each profile today, for the progress pills. */
export const todayProgress = computed(() => {
  const occ = todayOccurrences.value;
  return new Map(profiles.value.map((p) => [p.id, progress(forProfile(occ, p.id))]));
});

/* ---------- Ledger-backed writes ---------- */

function ledgerEntry(
  profileId: string,
  delta: number,
  reason: LedgerReason,
  label: string,
  ref?: string,
  note?: string,
): LedgerEntry {
  return { id: newId(), profileId, delta, reason, label, ref, note, at: currentTime() };
}

/** Check off an occurrence. `by` is who did it (required for Up for Grabs). */
export function completeTask(o: Occurrence, by: string = o.profileId): Promise<void> {
  if (by === UP_FOR_GRABS) throw new Error('completeTask: an Up for Grabs chore needs a claimer');
  const b = batch();
  const stars = o.task.stars;
  let ledgerId: string | undefined;
  if (stars > 0) {
    const e = ledgerEntry(by, stars, 'task', o.task.title, o.task.id);
    ledgerId = e.id;
    b.put('ledger', e).stars(by, stars);
  }
  const state: TaskState = {
    id: o.id,
    taskId: o.task.id,
    date: o.date,
    part: o.part,
    profileId: o.profileId,
    by,
    status: 'done',
    at: currentTime(),
    stars,
    ledgerId,
  };
  b.put('taskStates', state);
  if (o.task.repeatAfterDone)
    b.patch('tasks', o.task.id, { [`lastDone.${lastDoneKey(o.profileId)}`]: toISODate(new Date(currentTime())) } as never);
  return b.commit();
}

/**
 * A repeat-after-done chore's completion is being reversed: put lastDone back
 * so the occurrence is due (or late) again, unless a later completion moved it.
 */
function revertLastDone(b: ReturnType<typeof batch>, task: Task, st: TaskState): void {
  if (!task.repeatAfterDone) return;
  const key = lastDoneKey(st.profileId);
  if (task.lastDone?.[key] !== toISODate(new Date(st.at))) return;
  b.patch('tasks', task.id, { [`lastDone.${key}`]: lastDoneBefore(task, st.date) ?? deleteField() } as never);
}

/** Un-check: removes the state and takes the stars back (a reversing ledger entry). */
export function uncompleteTask(o: Occurrence): Promise<void> {
  const st = o.state;
  if (!st) return Promise.resolve();
  const b = batch().remove('taskStates', st.id);
  if (st.stars > 0) b.put('ledger', ledgerEntry(st.by, -st.stars, 'untask', o.task.title, o.task.id)).stars(st.by, -st.stars);
  if (st.ledgerId) b.patch('ledger', st.ledgerId, { undoneAt: currentTime() });
  revertLastDone(b, o.task, st);
  return b.commit();
}

export function skipTask(o: Occurrence): Promise<void> {
  const state: TaskState = {
    id: o.id,
    taskId: o.task.id,
    date: o.date,
    part: o.part,
    profileId: o.profileId,
    by: o.profileId,
    status: 'skipped',
    at: currentTime(),
    stars: 0,
  };
  return batch().put('taskStates', state).commit();
}

/** Parent gives (delta > 0) or removes (delta < 0) stars. */
export function adjustStars(profileId: string, delta: number, note?: string): Promise<void> {
  const label = delta > 0 ? 'Stars given' : 'Stars removed';
  return batch()
    .put('ledger', ledgerEntry(profileId, delta, delta > 0 ? 'give' : 'remove', label, undefined, note))
    .stars(profileId, delta)
    .commit();
}

export function redeemReward(reward: Reward, profileId: string): Promise<void> {
  const b = batch()
    .put('ledger', ledgerEntry(profileId, -reward.cost, 'redeem', reward.title, reward.id))
    .stars(profileId, -reward.cost);
  if (!reward.renews) b.patch('rewards', reward.id, { [`redeemedBy.${profileId}`]: currentTime() } as never);
  return b.commit();
}

/**
 * Undo a ledger entry from the history. Task completions are un-checked,
 * redemptions are reversed (and the reward made available again); anything
 * else gets a reversing 'undo' entry. The original is marked undone.
 */
export function undoLedgerEntry(entry: LedgerEntry): Promise<void> {
  if (entry.undoneAt) return Promise.resolve();
  const b = batch();
  const now = currentTime();
  b.patch('ledger', entry.id, { undoneAt: now });
  if (entry.reason === 'task') {
    const st = data.taskStates.value.find((s) => s.ledgerId === entry.id);
    const task = st && data.tasks.value.find((t) => t.id === st.taskId);
    if (st) b.remove('taskStates', st.id);
    if (st && task) revertLastDone(b, task, st);
  }
  if (entry.reason === 'redeem' && entry.ref) {
    const reward = data.rewards.value.find((r) => r.id === entry.ref);
    if (reward && !reward.renews && reward.redeemedBy[entry.profileId]) {
      const { [entry.profileId]: _gone, ...rest } = reward.redeemedBy;
      b.patch('rewards', reward.id, { redeemedBy: rest });
    }
  }
  const reason: LedgerReason = entry.reason === 'redeem' ? 'unredeem' : entry.reason === 'task' ? 'untask' : 'undo';
  b.put('ledger', { ...ledgerEntry(entry.profileId, -entry.delta, reason, entry.label, entry.id), at: now });
  b.stars(entry.profileId, -entry.delta);
  return b.commit();
}

/** Ledger entries for one profile, newest first. */
export const ledgerFor = (profileId: string) =>
  data.ledger.value.filter((e) => e.profileId === profileId).sort((a, b) => b.at - a.at);

export const nameOf = (profileId: string) => profileById.value.get(profileId)?.name ?? 'Someone';
