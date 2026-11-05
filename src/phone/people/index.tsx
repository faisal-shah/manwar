import './people.css';
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { ChevronDown, ChevronUp, Plus, Users } from 'lucide-preact';
import { profiles } from '../../data/store';
import type { Profile } from '../../data/types';
import { plural } from '../../lib/text';
import { formatBirthday } from '../../features/settings/logic';
import { ProfileFields, useProfileEditor } from '../../features/settings/ProfileFields';
import { moveProfile } from '../../features/settings/profiles';
import { Button, IconButton } from '../../ui/controls';
import { Sheet, swallowRestOfTap } from '../../ui/overlays';
import { Avatar } from '../../ui/profile';
import type { MoreItem } from '../more/items';
import { moreView } from '../more/view';
import { goPhone } from '../nav';

/** The person whose editor is open ('new' for one being added), while More > People shows. */
const editing = signal<Profile | 'new' | null>(null);

/** More > People with the editor open on a new person (a tab with no people yet offers it). */
export function addFirstPerson(): void {
  swallowRestOfTap();
  goPhone('more');
  moreView.value = 'people';
  editing.value = 'new';
}

/**
 * More > People: the household's people, as the wall's Settings > Profiles
 * has them (the same writes): add, edit, reorder and delete.
 */
function PeopleView() {
  // The editor is this view's: it does not come back with the view later.
  useEffect(() => () => void (editing.value = null), []);
  const list = profiles.value;
  return (
    <div class="ph-stack">
      <section class="ph-card" aria-label="People">
        {list.length === 0 ? (
          <p class="muted">No people yet. Add one for each person in the family: their tasks, stars and events follow.</p>
        ) : (
          <ul class="pp-list">
            {list.map((p, i) => (
              <li key={p.id} class="pp-row">
                <button type="button" class="pp-open" aria-label={`Edit ${p.name}`} onClick={() => (editing.value = p)}>
                  <Avatar profile={p} size={4.4} />
                  <span class="pp-text">
                    <span class="pp-name" dir="auto">
                      {p.name}
                    </span>
                    <small>
                      {p.birthday ? `Birthday ${formatBirthday(p.birthday)}` : 'No birthday'} · {plural(p.stars, 'star')}
                    </small>
                  </span>
                </button>
                <IconButton label={`Move ${p.name} up`} disabled={i === 0} onClick={() => void moveProfile(i, -1)}>
                  <ChevronUp size="2.4rem" />
                </IconButton>
                <IconButton label={`Move ${p.name} down`} disabled={i === list.length - 1} onClick={() => void moveProfile(i, 1)}>
                  <ChevronDown size="2.4rem" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <Button class="ps-add" onClick={() => (editing.value = 'new')}>
          <Plus size="2rem" /> Add a person
        </Button>
      </section>
      <p class="muted pp-hint">
        Each person's color marks their events, tasks and rewards. The order here is the order on the wall.
      </p>
      <EditorHost />
    </div>
  );
}

function EditorHost() {
  const e = editing.value;
  if (!e) return null;
  const p = e === 'new' ? null : e;
  return <PersonEditor key={p?.id ?? 'new'} profile={p} onClose={() => (editing.value = null)} />;
}

function PersonEditor({ profile, onClose }: { profile: Profile | null; onClose: () => void }) {
  const ed = useProfileEditor(profile, onClose, 'Delete');
  return (
    <Sheet
      title={profile ? 'Edit person' : 'Add a person'}
      onClose={onClose}
      footer={
        <>
          {profile && (
            <Button variant="danger" style={{ marginRight: 'auto' }} onClick={() => void ed.remove()}>
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!ed.problem} onClick={() => void ed.save()}>
            {profile ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div class="pp-form">
        <ProfileFields draft={ed.draft} onChange={ed.setDraft} taken={ed.problem === 'taken'} avatar={7.2} />
      </div>
    </Sheet>
  );
}

export const peopleItem: MoreItem = {
  id: 'people',
  label: 'People',
  icon: Users,
  hint: () => (profiles.value.length ? plural(profiles.value.length, 'person', 'people') : 'Add the family'),
  View: PeopleView,
};
