import { arrayRemove, arrayUnion } from 'firebase/firestore';
import { asParent } from '../../core/lock';
import { changedFields, profileShownChange } from '../../data/settings';
import { batch, data, fieldChanges, newId, patch, profileById, profiles, put, saveSettings, settings } from '../../data/store';
import { NOBODY, type Profile } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { PROFILE_COLORS } from '../../ui/pickers';
import {
  moveId,
  moveTarget,
  planProfileDelete,
  profileFields,
  type MoveRun,
  type ProfileDeletePlan,
  type ProfileDraft,
} from './logic';

/**
 * Adding, editing, reordering and deleting profiles: the writes behind the
 * wall's Settings > Profiles and the phone's More > People. Each asks for
 * the PIN (a paired phone is a parent's, so there it passes at once).
 */

const REASON = 'Enter the PIN to change profiles.';
/** Firestore batches hold at most 500 writes. */
const BATCH_LIMIT = 450;

/** The first palette color no profile has yet (the first one when all are taken). */
function nextColor(): string {
  const used = new Set(profiles.value.map((p) => p.color.toLowerCase()));
  return PROFILE_COLORS.find((c) => !used.has(c.toLowerCase())) ?? PROFILE_COLORS[0];
}

/** The draft an editor opens with: the profile's, or a new one in a free color. */
export function draftOf(p: Profile | null): ProfileDraft {
  return { name: p?.name ?? '', color: p?.color ?? nextColor(), emoji: p?.emoji, birthday: p?.birthday ?? '' };
}

/**
 * Save a new profile, or the fields of `draft` that differ from `opened`
 * (what the editor opened with), so a change another device made to the
 * others meanwhile is kept. Resolves true once written; false when the
 * PIN was refused or the profile is gone (deleted elsewhere while the PIN
 * pad was up).
 */
export async function saveProfile(profile: Profile | null, opened: ProfileDraft, draft: ProfileDraft): Promise<boolean> {
  let saved = false;
  await asParent(() => {
    if (profile) {
      if (!profileById.value.has(profile.id)) return;
      const changed = changedFields(profileFields(opened), profileFields(draft));
      if (Object.keys(changed).length) void patch('profiles', profile.id, fieldChanges(changed) as Partial<Profile>);
    } else {
      void put('profiles', {
        id: newId(),
        ...profileFields(draft),
        order: Math.max(-1, ...profiles.value.map((p) => p.order)) + 1,
        stars: 0,
        createdAt: currentTime(),
      });
    }
    saved = true;
  }, REASON);
  return saved;
}

/** The run of Move taps in progress (see moveTarget). */
let moveRun: MoveRun | null = null;

/** Move the profile at `tapped` (its place in `profiles`) one place up (-1) or down (1). */
export function moveProfile(tapped: number, dir: -1 | 1): Promise<void> {
  return asParent(() => {
    const ids = profiles.value.map((p) => p.id);
    const t = moveTarget(ids, tapped, dir, moveRun, performance.now());
    moveRun = t.run;
    const b = batch();
    moveId(ids, t.index, t.index + dir).forEach((id, order) => b.patch('profiles', id, { order }));
    void b.commit();
  }, REASON);
}

/** What deleting `p` would do now (for the confirmation that names it). */
export const deletePlan = (p: Profile): ProfileDeletePlan =>
  planProfileDelete(p.id, { tasks: data.tasks.value, rewards: data.rewards.value, eventMeta: data.eventMeta.value });

/**
 * Delete `p` once its editor's confirmation said yes. Resolves true once
 * written; false when the PIN was refused or it was deleted elsewhere
 * meanwhile.
 */
export async function deleteProfile(p: Profile): Promise<boolean> {
  let done = false;
  await asParent(() => {
    if (!profileById.value.has(p.id)) return;
    applyDelete(p);
    done = true;
  }, REASON);
  return done;
}

/**
 * Archive what only this profile had, take it off shared items, then remove
 * it. Planned again here: tasks or events may have changed while the
 * confirmation was up. The profile is taken out of each list (arrayRemove)
 * rather than the list rewritten, so an assignment changed on another
 * device meanwhile is kept.
 */
function applyDelete(p: Profile): void {
  const plan = deletePlan(p);
  const without = arrayRemove(p.id) as never;
  const b = batch();
  plan.archiveTasks.forEach((id) => b.patch('tasks', id, { archived: true }));
  plan.unassignTasks.forEach(({ id }) => b.patch('tasks', id, { assignees: without }));
  plan.archiveRewards.forEach((id) => b.patch('rewards', id, { archived: true }));
  plan.unassignRewards.forEach(({ id }) => b.patch('rewards', id, { profiles: without }));
  b.remove('profiles', p.id);
  void b.commit();
  const at = currentTime();
  // Two writes per document at most, so half a batch of documents per batch.
  for (let i = 0; i < plan.eventMeta.length; i += BATCH_LIMIT / 2) {
    const mb = batch();
    for (const { id, profiles: rest } of plan.eventMeta.slice(i, i + BATCH_LIMIT / 2)) {
      mb.patch('eventMeta', id, { profiles: without, updatedAt: at });
      // Left with nobody: marked so, which an assignment made elsewhere meanwhile outranks (NOBODY beside a profile is ignored).
      if (rest.includes(NOBODY)) mb.patch('eventMeta', id, { profiles: arrayUnion(NOBODY) as never });
    }
    void mb.commit();
  }
  if (settings.value.filter.hiddenProfiles.includes(p.id)) void saveSettings(profileShownChange(p.id, true));
}
