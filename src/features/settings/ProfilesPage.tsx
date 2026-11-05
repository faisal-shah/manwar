import { useState } from 'preact/hooks';
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Plus, Trash2 } from 'lucide-preact';
import { profiles } from '../../data/store';
import type { Profile } from '../../data/types';
import { plural } from '../../lib/text';
import { Button, IconButton } from '../../ui/controls';
import { Avatar } from '../../ui/profile';
import { formatBirthday } from './logic';
import { Group, PageTitle } from './parts';
import { ProfileFields, useProfileEditor } from './ProfileFields';
import { moveProfile } from './profiles';

export function ProfilesPage() {
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  if (editing) return <ProfileEditor profile={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />;
  const list = profiles.value;
  return (
    <>
      <PageTitle>Profiles</PageTitle>
      <Group hint="Each person's color marks their events, tasks and rewards. The order here is the order on the wall.">
        {list.map((p, i) => (
          <div class="set-row profile-row">
            <button type="button" class="profile-open" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
              <Avatar profile={p} size={5.6} />
              <span class="set-label">
                <span class="profile-name" dir="auto">
                  {p.name}
                </span>
                <small>
                  {p.birthday ? `Birthday ${formatBirthday(p.birthday)}` : 'No birthday'} · {plural(p.stars, 'star')}
                </small>
              </span>
              <ChevronRight size="2.4rem" class="muted" />
            </button>
            <IconButton label={`Move ${p.name} up`} disabled={i === 0} onClick={() => void moveProfile(i, -1)}>
              <ChevronUp size="2.6rem" />
            </IconButton>
            <IconButton label={`Move ${p.name} down`} disabled={i === list.length - 1} onClick={() => void moveProfile(i, 1)}>
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

function ProfileEditor({ profile, onDone }: { profile: Profile | null; onDone: () => void }) {
  const ed = useProfileEditor(profile, onDone, 'Delete profile');
  return (
    <>
      <button type="button" class="set-back" onClick={onDone}>
        <ArrowLeft size="2.2rem" />
        Profiles
      </button>
      <PageTitle>{profile ? 'Edit profile' : 'New profile'}</PageTitle>
      <ProfileFields draft={ed.draft} onChange={ed.setDraft} taken={ed.problem === 'taken'} />
      <div class="set-actions">
        {profile && (
          <Button variant="danger" onClick={() => void ed.remove()}>
            <Trash2 size="2rem" />
            Delete
          </Button>
        )}
        <span class="grow" />
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!!ed.problem} onClick={() => void ed.save()}>
          {profile ? 'Save' : 'Create profile'}
        </Button>
      </div>
    </>
  );
}
