import { useState } from 'preact/hooks';
import { arrayRemove, arrayUnion, deleteField } from 'firebase/firestore';
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from 'lucide-preact';
import { asParent } from '../../core/lock';
import { profileShownChange } from '../../data/settings';
import { batch, data, newId, patch, profileById, profiles, put, saveSettings, settings } from '../../data/store';
import { NOBODY, type Profile } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { fromISODate, monthShort } from '../../lib/date';
import { Button, Field, IconButton } from '../../ui/controls';
import { confirm, toast, useCloseWhenGone } from '../../ui/overlays';
import { ColorSwatches, EmojiPicker, PROFILE_COLORS } from '../../ui/pickers';
import { Avatar } from '../../ui/profile';
import { describeProfileDelete, moveId, moveTarget, nameTaken, planProfileDelete, type MoveRun } from './logic';
import { Group, PageTitle } from './parts';
import { plural } from '../../lib/text';

const REASON = 'Enter the PIN to change profiles.';
/** Firestore batches hold at most 500 writes. */
const BATCH_LIMIT = 450;

const formatBirthday = (iso: string) => {
  const d = fromISODate(iso);
  return `${monthShort(d.getMonth())} ${d.getDate()}`;
};

/** The run of Move taps in progress (see moveTarget). */
let moveRun: MoveRun | null = null;

export function ProfilesPage() {
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  if (editing) return <ProfileEditor profile={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />;
  const list = profiles.value;
  const move = (tapped: number, dir: -1 | 1) =>
    asParent(() => {
      const ids = profiles.value.map((p) => p.id);
      const t = moveTarget(ids, tapped, dir, moveRun, performance.now());
      moveRun = t.run;
      const b = batch();
      moveId(ids, t.index, t.index + dir).forEach((id, order) => b.patch('profiles', id, { order }));
      void b.commit();
    }, REASON);
  return (
    <>
      <PageTitle>Profiles</PageTitle>
      <Group hint="Each person's color marks their events, tasks and rewards. The order here is the order on the wall.">
        {list.map((p, i) => (
          <div class="set-row profile-row">
            <button type="button" class="profile-open" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
              <Avatar profile={p} size={5.6} />
              <span class="set-label">
                <span class="profile-name">{p.name}</span>
                <small>
                  {p.birthday ? `Birthday ${formatBirthday(p.birthday)}` : 'No birthday'} · {plural(p.stars, 'star')}
                </small>
              </span>
              <ChevronRight size="2.4rem" class="muted" />
            </button>
            <IconButton label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ChevronUp size="2.6rem" />
            </IconButton>
            <IconButton label={`Move ${p.name} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
              <ChevronDown size="2.6rem" />
            </IconButton>
          </div>
        ))}
        {list.length === 0 && <p class="muted">No profiles yet. Add one for each person in the family.</p>}
      </Group>
      <Button variant="primary" class="set-big" onClick={() => setEditing('new')}>
        <Plus size="2.2rem" />
        Add a profile
      </Button>
    </>
  );
}

function nextColor(): string {
  const used = new Set(profiles.value.map((p) => p.color.toLowerCase()));
  return PROFILE_COLORS.find((c) => !used.has(c.toLowerCase())) ?? PROFILE_COLORS[0];
}

/**
 * Archive what only this profile had, take it off shared items, then remove
 * it. The profile is taken out of each list (arrayRemove) rather than the
 * list rewritten, so an assignment changed on another device meanwhile is kept.
 */
function applyDelete(p: Profile): void {
  const plan = planProfileDelete(p.id, { tasks: data.tasks.value, rewards: data.rewards.value, eventMeta: data.eventMeta.value });
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

function ProfileEditor({ profile, onDone }: { profile: Profile | null; onDone: () => void }) {
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? nextColor);
  const [emoji, setEmoji] = useState<string | undefined>(profile?.emoji);
  const [birthday, setBirthday] = useState(profile?.birthday ?? '');
  const trimmed = name.trim();
  const taken = nameTaken(trimmed, profiles.value, profile?.id);
  useCloseWhenGone(!!profile && !profileById.value.has(profile.id), onDone, `${profile?.name} was deleted on another device.`);

  const save = () =>
    asParent(() => {
      if (profile) {
        // Cleared optional fields are deleted; updateDoc would skip undefined values.
        void patch('profiles', profile.id, {
          name: trimmed,
          color,
          emoji: emoji ?? deleteField(),
          birthday: birthday || deleteField(),
        } as Partial<Profile>);
      } else {
        const order = Math.max(-1, ...profiles.value.map((p) => p.order)) + 1;
        void put('profiles', {
          id: newId(),
          name: trimmed,
          color,
          emoji,
          birthday: birthday || undefined,
          order,
          stars: 0,
          createdAt: currentTime(),
        });
      }
      onDone();
    }, REASON);

  const remove = async () => {
    if (!profile) return;
    const plan = planProfileDelete(profile.id, {
      tasks: data.tasks.value,
      rewards: data.rewards.value,
      eventMeta: data.eventMeta.value,
    });
    const ok = await confirm(`Delete ${profile.name}?`, {
      body: describeProfileDelete(profile.name, plan),
      ok: 'Delete profile',
      danger: true,
    });
    if (!ok) return;
    await asParent(() => {
      // Planned again: tasks or events may have changed while the dialog was up.
      applyDelete(profile);
      toast(`${profile.name} was deleted.`);
      onDone();
    }, REASON);
  };

  return (
    <>
      <button type="button" class="set-back" onClick={onDone}>
        <ArrowLeft size="2.2rem" />
        Profiles
      </button>
      <PageTitle>{profile ? 'Edit profile' : 'New profile'}</PageTitle>
      <div class="profile-preview">
        <Avatar profile={{ name: trimmed || '?', color, emoji }} size={10} />
        <span>{trimmed || 'Name'}</span>
      </div>
      <Field label="Name">
        <input
          class="input"
          aria-label="Name"
          maxLength={30}
          placeholder="Name"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        {taken && (
          <span class="set-error" role="alert">
            Another profile is already called {trimmed}.
          </span>
        )}
      </Field>
      <Field label="Color">
        <ColorSwatches value={color} onChange={setColor} />
      </Field>
      <Field label="Avatar: an emoji, or none for the initial">
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </Field>
      <Field label="Birthday">
        <div class="row">
          <input
            class="input set-date"
            type="date"
            aria-label="Birthday"
            value={birthday}
            onInput={(e) => setBirthday((e.target as HTMLInputElement).value)}
          />
          {birthday && (
            <Button variant="ghost" onClick={() => setBirthday('')}>
              No birthday
            </Button>
          )}
        </div>
      </Field>
      <div class="set-actions">
        {profile && (
          <Button variant="danger" onClick={() => void remove()}>
            <Trash2 size="2rem" />
            Delete
          </Button>
        )}
        <span class="grow" />
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!trimmed || taken} onClick={() => void save()}>
          {profile ? 'Save' : 'Create profile'}
        </Button>
      </div>
    </>
  );
}
