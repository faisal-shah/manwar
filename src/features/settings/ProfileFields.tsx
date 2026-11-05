import { useState } from 'preact/hooks';
import { profileById, profiles } from '../../data/store';
import type { Profile } from '../../data/types';
import { isolate } from '../../lib/text';
import { Button, Field } from '../../ui/controls';
import { confirm, toast, useCloseWhenGone } from '../../ui/overlays';
import { ColorSwatches, EmojiPicker, PROFILE_EMOJI } from '../../ui/pickers';
import { Avatar } from '../../ui/profile';
import { describeProfileDelete, draftProblem, type ProfileDraft } from './logic';
import { deletePlan, deleteProfile, draftOf, saveProfile } from './profiles';

/**
 * A profile editor's state and actions, for the wall's Settings > Profiles
 * and the phone's More > People (which differ only in their words and
 * layout). It closes (`onDone`) once saved or deleted, and when the
 * profile is deleted on another device. `deleteLabel` is the
 * confirmation's button.
 */
export function useProfileEditor(profile: Profile | null, onDone: () => void, deleteLabel: string) {
  const [opened] = useState(() => draftOf(profile));
  const [draft, setDraft] = useState(opened);
  const problem = draftProblem(draft, opened, profiles.value, profile?.id);
  const name = isolate(profile?.name ?? '');
  useCloseWhenGone(!!profile && !profileById.value.has(profile.id), onDone, `${name} was deleted on another device.`);
  const save = async () => {
    if (await saveProfile(profile, opened, draft)) onDone();
  };
  const remove = async () => {
    if (!profile) return;
    const ok = await confirm(`Delete ${name}?`, {
      body: describeProfileDelete(profile.name, deletePlan(profile)),
      ok: deleteLabel,
      danger: true,
    });
    if (!ok || !(await deleteProfile(profile))) return;
    toast(`${name} was deleted.`);
    onDone();
  };
  return { draft, setDraft, problem, save, remove };
}

/** A profile editor's fields: a preview, the name, color, avatar and birthday. */
export function ProfileFields({
  draft,
  onChange,
  taken,
  avatar = 10,
}: {
  draft: ProfileDraft;
  onChange: (d: ProfileDraft) => void;
  /** The name is another profile's. */
  taken: boolean;
  /** The preview avatar's size, in rem. */
  avatar?: number;
}) {
  const set = (part: Partial<ProfileDraft>) => onChange({ ...draft, ...part });
  const name = draft.name.trim();
  return (
    <>
      <div class="profile-preview">
        <Avatar profile={{ name: name || '?', color: draft.color, emoji: draft.emoji }} size={avatar} />
        <span dir="auto">{name || 'Name'}</span>
      </div>
      <Field label="Name">
        <input
          class="input"
          aria-label="Name"
          maxLength={30}
          placeholder="Name"
          value={draft.name}
          onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
        />
        {taken && (
          <span class="set-error" role="alert">
            Someone else is already called <bdi>{name}</bdi>.
          </span>
        )}
      </Field>
      <Field label="Color">
        <ColorSwatches value={draft.color} onChange={(color) => set({ color })} />
      </Field>
      <Field label="Avatar: an emoji, or none for the initial">
        <EmojiPicker value={draft.emoji} onChange={(emoji) => set({ emoji })} groups={PROFILE_EMOJI} />
      </Field>
      <Field label="Birthday">
        <div class="row">
          <input
            class="input set-date"
            type="date"
            aria-label="Birthday"
            value={draft.birthday}
            onInput={(e) => set({ birthday: (e.target as HTMLInputElement).value })}
          />
          {draft.birthday && (
            <Button variant="ghost" onClick={() => set({ birthday: '' })}>
              No birthday
            </Button>
          )}
        </div>
      </Field>
    </>
  );
}
