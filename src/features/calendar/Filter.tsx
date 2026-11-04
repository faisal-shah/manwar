import { CloudSun, ListChecks, Timer, Users, UtensilsCrossed } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { profiles, saveSettings, settings } from '../../data/store';
import type { Settings } from '../../data/types';
import { Toggle } from '../../ui/controls';
import { Avatar } from '../../ui/profile';
import { Menu } from './Menu';

type FilterState = Settings['filter'];

/** Filter writes are viewing preferences, not data changes, so they are not behind the parent PIN. */
const setFilter = (patch: Partial<FilterState>) => void saveSettings({ filter: { ...settings.value.filter, ...patch } });

function Row({
  icon,
  label,
  on,
  onChange,
}: {
  icon: ComponentChildren;
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div class="cal-filter-row">
      <span class="cal-filter-icon">{icon}</span>
      <span class="cal-filter-label">{label}</span>
      <Toggle label={label} on={on} onChange={onChange} />
    </div>
  );
}

const ICON = { size: '2.2rem', strokeWidth: 1.8 };

/** Filter card: task progress, countdowns, weather, meals, and each profile (Select All). */
export function FilterMenu({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const f = settings.value.filter;
  const all = profiles.value;
  const hidden = new Set(f.hiddenProfiles);
  return (
    <Menu anchor={anchor} onClose={onClose} width={40} label="Filter">
      <Row
        icon={<ListChecks {...ICON} />}
        label="Tasks progress"
        on={f.taskProgress}
        onChange={(taskProgress) => setFilter({ taskProgress })}
      />
      <Row icon={<Timer {...ICON} />} label="Countdowns" on={f.countdowns} onChange={(countdowns) => setFilter({ countdowns })} />
      <Row icon={<CloudSun {...ICON} />} label="Weather forecast" on={f.weather} onChange={(weather) => setFilter({ weather })} />
      <Row icon={<UtensilsCrossed {...ICON} />} label="Meals" on={f.meals} onChange={(meals) => setFilter({ meals })} />
      <h3 class="serif cal-filter-section">Events</h3>
      <Row
        icon={<Users {...ICON} />}
        label="Select All"
        on={hidden.size === 0}
        onChange={(on) => setFilter({ hiddenProfiles: on ? [] : all.map((p) => p.id) })}
      />
      {all.map((p) => (
        <Row
          key={p.id}
          icon={<Avatar profile={p} size={3} />}
          label={p.name}
          on={!hidden.has(p.id)}
          onChange={(on) =>
            setFilter({ hiddenProfiles: on ? f.hiddenProfiles.filter((id) => id !== p.id) : [...f.hiddenProfiles, p.id] })
          }
        />
      ))}
    </Menu>
  );
}
