import { profiles, settings } from '../data/store';
import { EVERYONE, type Profile } from '../data/types';
import { toggleAssignee } from '../lib/assignees';

export function Avatar({
  profile,
  size = 4,
  ring,
  off,
}: {
  profile: Pick<Profile, 'name' | 'color' | 'emoji'>;
  size?: number;
  ring?: boolean;
  off?: boolean;
}) {
  const style = {
    '--c': profile.color,
    width: `${size}rem`,
    height: `${size}rem`,
    fontSize: `${size * (profile.emoji ? 0.58 : 0.45)}rem`,
  };
  return (
    <span
      class={`avatar${profile.emoji ? ' emoji' : ''}${ring ? ' ring' : ''}${off ? ' off' : ''}`}
      style={style}
      aria-hidden="true"
    >
      {profile.emoji || profile.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export const everyoneProfile = () => ({ name: 'Everyone', color: settings.value.familyColor, emoji: '👪' });

/**
 * Tap avatars to choose profiles. With `everyone`, an "Everyone" choice is
 * offered; it is exclusive with individual profiles.
 */
export function ProfilePicker({
  value,
  onChange,
  everyone,
  single,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  everyone?: boolean;
  single?: boolean;
}) {
  const toggle = (id: string) => onChange(single ? [id] : toggleAssignee(value, id));
  return (
    <div class="picker">
      {profiles.value.map((p) => {
        const on = value.includes(p.id);
        return (
          <button type="button" class={on ? 'on' : ''} aria-pressed={on} onClick={() => toggle(p.id)}>
            <Avatar profile={p} size={5.2} ring={on} off={!on && value.length > 0} />
            {p.name}
          </button>
        );
      })}
      {everyone && (
        <button
          type="button"
          class={value.includes(EVERYONE) ? 'on' : ''}
          aria-pressed={value.includes(EVERYONE)}
          onClick={() => toggle(EVERYONE)}
        >
          <Avatar profile={everyoneProfile()} size={5.2} ring={value.includes(EVERYONE)} />
          Everyone
        </button>
      )}
    </div>
  );
}
