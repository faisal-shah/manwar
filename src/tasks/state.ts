import { computed } from '@preact/signals';
import { deleteField, onSnapshotsInSync } from 'firebase/firestore';
import { db } from '../data/firebase';
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
import { firstHistoryDay, forProfile, lastDoneBefore, madeAt, occurrencesOn, progress, type Occurrence } from './engine';

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

/*
 * Every write below decides from the store, not from the caller's copy, and
 * holds its keys (an occurrence, a ledger entry, a profile's balance) until
 * the store shows the result. Firestore applies a write to its cache and
 * raises the snapshot a few milliseconds later (more with IndexedDB), so a
 * second tap in that gap would otherwise see the old state and award,
 * refund or charge the stars twice. Snapshots-in-sync fires once every
 * listener has seen the write. Each write returns null when it did nothing.
 */
const busy = new Set<string>();

function exclusive(keys: (string | undefined)[], write: () => Promise<void>): Promise<void> | null {
  const held = keys.filter((k): k is string => !!k);
  if (held.some((k) => busy.has(k))) return null;
  held.forEach((k) => busy.add(k));
  const done = write();
  const stop = onSnapshotsInSync(db, () => {
    stop();
    held.forEach((k) => busy.delete(k));
  });
  return done;
}

const taskOf = (id: string, fallback: Task) => data.tasks.value.find((t) => t.id === id) ?? fallback;

/** Older states are not loaded, so a check-off or skip there would never show (and could be repeated). */
const inHistory = (o: Occurrence, day: ISODate) => {
  const first = firstHistoryDay(today.value);
  return o.date >= first && day >= first;
};

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

/**
 * Check off an occurrence while viewing `day`. `by` is who did it (the
 * claimer for Up for Grabs). Null when it is already done.
 */
export function completeTask(o: Occurrence, by: string, day: ISODate): Promise<void> | null {
  if (by === UP_FOR_GRABS) throw new Error('completeTask: an Up for Grabs chore needs a claimer');
  if (statesById.value.get(o.id)?.status === 'done' || !inHistory(o, day)) return null;
  const task = taskOf(o.task.id, o.task);
  return exclusive([o.id], () => {
    const b = batch();
    const stars = task.stars;
    let ledgerId: string | undefined;
    if (stars > 0) {
      const e = ledgerEntry(by, stars, 'task', task.title, task.id);
      ledgerId = e.id;
      b.put('ledger', e).stars(by, stars);
    }
    const at = madeAt(day, currentTime());
    const state: TaskState = {
      id: o.id,
      taskId: task.id,
      date: o.date,
      part: o.part,
      profileId: o.profileId,
      by,
      status: 'done',
      at,
      stars,
      ledgerId,
    };
    b.put('taskStates', state);
    if (task.repeatAfterDone)
      b.patch('tasks', task.id, { [`lastDone.${lastDoneKey(o.profileId)}`]: toISODate(new Date(at)) } as never);
    return b.commit();
  });
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

/** Un-check: removes the state and takes the stars back (a reversing ledger entry). Null when it is not done. */
export function uncompleteTask(o: Occurrence): Promise<void> | null {
  const st = statesById.value.get(o.id);
  if (st?.status !== 'done') return null;
  const task = taskOf(st.taskId, o.task);
  return exclusive([st.id, st.ledgerId], () => {
    const b = batch().remove('taskStates', st.id);
    if (st.stars > 0) b.put('ledger', ledgerEntry(st.by, -st.stars, 'untask', task.title, task.id)).stars(st.by, -st.stars);
    if (st.ledgerId) b.patch('ledger', st.ledgerId, { undoneAt: currentTime() });
    revertLastDone(b, task, st);
    return b.commit();
  });
}

/**
 * Skip an occurrence while viewing `day`. A repeat-after-done chore counts
 * the skip like a completion (without stars), so it comes round again.
 * Null when it is already done or skipped.
 */
export function skipTask(o: Occurrence, day: ISODate): Promise<void> | null {
  if (statesById.value.has(o.id) || !inHistory(o, day)) return null;
  const task = taskOf(o.task.id, o.task);
  return exclusive([o.id], () => {
    const at = madeAt(day, currentTime());
    const state: TaskState = {
      id: o.id,
      taskId: task.id,
      date: o.date,
      part: o.part,
      profileId: o.profileId,
      by: o.profileId,
      status: 'skipped',
      at,
      stars: 0,
    };
    const b = batch().put('taskStates', state);
    if (task.repeatAfterDone)
      b.patch('tasks', task.id, { [`lastDone.${lastDoneKey(o.profileId)}`]: toISODate(new Date(at)) } as never);
    return b.commit();
  });
}

/** Null when the occurrence is not skipped. */
export function unskipTask(o: Occurrence): Promise<void> | null {
  const st = statesById.value.get(o.id);
  if (st?.status !== 'skipped') return null;
  const task = taskOf(st.taskId, o.task);
  return exclusive([st.id], () => {
    const b = batch().remove('taskStates', st.id);
    revertLastDone(b, task, st);
    return b.commit();
  });
}

/** Parent gives (delta > 0) or removes (delta < 0) stars. */
export function adjustStars(profileId: string, delta: number, note?: string): Promise<void> {
  const label = delta > 0 ? 'Stars given' : 'Stars removed';
  return batch()
    .put('ledger', ledgerEntry(profileId, delta, delta > 0 ? 'give' : 'remove', label, undefined, note))
    .stars(profileId, delta)
    .commit();
}

/**
 * Spend a profile's stars on a reward at its cost. Null when the balance does
 * not cover it (or another redemption for the profile is still landing);
 * otherwise the ledger entry written, for an undo.
 */
export function redeemReward(reward: Reward, profileId: string): LedgerEntry | null {
  const p = profileById.value.get(profileId);
  if (!p || p.stars < reward.cost) return null;
  const e = ledgerEntry(profileId, -reward.cost, 'redeem', reward.title, reward.id);
  const write = exclusive([`stars:${profileId}`], () => {
    const b = batch().put('ledger', e).stars(profileId, -reward.cost);
    if (!reward.renews) b.patch('rewards', reward.id, { [`redeemedBy.${profileId}`]: e.at } as never);
    return b.commit();
  });
  return write ? e : null;
}

/**
 * Undo a ledger entry from the history. Task completions are un-checked,
 * redemptions are reversed (and the reward made available again); anything
 * else gets a reversing 'undo' entry. The original is marked undone. Null
 * when it already was.
 */
export function undoLedgerEntry(entry: LedgerEntry): Promise<void> | null {
  const e = data.ledger.value.find((x) => x.id === entry.id) ?? entry;
  if (e.undoneAt) return null;
  const st = e.reason === 'task' ? data.taskStates.value.find((s) => s.ledgerId === e.id) : undefined;
  return exclusive([e.id, st?.id, e.reason === 'redeem' ? `stars:${e.profileId}` : undefined], () => {
    const b = batch();
    const now = currentTime();
    b.patch('ledger', e.id, { undoneAt: now });
    if (st) {
      b.remove('taskStates', st.id);
      const task = data.tasks.value.find((t) => t.id === st.taskId);
      if (task) revertLastDone(b, task, st);
    }
    if (e.reason === 'redeem' && e.ref) {
      const reward = data.rewards.value.find((r) => r.id === e.ref);
      // The reward stays redeemed while another redemption of it by this profile stands.
      const another = data.ledger.value.some(
        (x) => x.id !== e.id && x.reason === 'redeem' && x.ref === e.ref && x.profileId === e.profileId && !x.undoneAt,
      );
      if (reward?.redeemedBy?.[e.profileId] !== undefined && !another)
        b.patch('rewards', reward.id, { [`redeemedBy.${e.profileId}`]: deleteField() } as never);
    }
    const reason: LedgerReason = e.reason === 'redeem' ? 'unredeem' : e.reason === 'task' ? 'untask' : 'undo';
    b.put('ledger', { ...ledgerEntry(e.profileId, -e.delta, reason, e.label, e.id), at: now });
    b.stars(e.profileId, -e.delta);
    return b.commit();
  });
}

/** Ledger entries for one profile, newest first. */
export const ledgerFor = (profileId: string) =>
  data.ledger.value.filter((e) => e.profileId === profileId).sort((a, b) => b.at - a.at);

export const nameOf = (profileId: string) => profileById.value.get(profileId)?.name ?? 'Someone';
