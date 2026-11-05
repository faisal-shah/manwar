import { Settings as SettingsIcon } from 'lucide-preact';
import { activeTab, goTo } from '../../app/nav';
import { TABS } from '../../app/tabs';
import { asParent } from '../../core/lock';
import { hiddenChange, windowChange } from '../../data/settings';
import { saveSettings, settings } from '../../data/store';
import type { TabId } from '../../data/types';
import { canHideTab, fallbackTab, setTabShown } from './logic';
import { ChoiceRow, Group, PageTitle, ToggleRow, WindowRow, change } from './parts';

const IDLE_CHOICES = [0, 1, 2, 5, 10];

function setTab(id: TabId, shown: boolean) {
  return asParent(() => {
    const now = settings.value.hiddenTabs;
    const next = setTabShown(now, id, shown);
    if (next === now) return;
    if (next.includes(activeTab.value)) goTo(fallbackTab(next));
    void saveSettings(hiddenChange('hiddenTabs', id, !shown));
  }, 'Enter the PIN to change settings.');
}

export function DisplayPage() {
  const s = settings.value;
  const hidden = s.hiddenTabs;
  return (
    <>
      <PageTitle>Display</PageTitle>
      <Group>
        <ChoiceRow
          label="Text size"
          value={s.textScale}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
          onChange={(textScale) => void change({ textScale })}
        />
      </Group>
      <Group title="Tabs on the rail" hint="Home or Calendar stays on, so the wall always has a page to return to.">
        {TABS.map((t) => {
          const shown = !hidden.includes(t.id);
          const locked = shown && !canHideTab(hidden, t.id);
          return (
            <ToggleRow
              lead={<t.icon size="2.4rem" strokeWidth={1.8} />}
              label={t.label}
              hint={locked ? 'Turn on Home or Calendar first' : undefined}
              on={shown}
              disabled={locked}
              onChange={(on) => void setTab(t.id, on)}
            />
          );
        })}
        <ToggleRow
          lead={<SettingsIcon size="2.4rem" strokeWidth={1.8} />}
          label="Settings"
          hint="Always shown"
          on
          disabled
          onChange={() => {}}
        />
      </Group>
      <Group title="Night mode" hint="Between these times the wall uses the dark theme and dims the screen.">
        <ToggleRow
          label="Dark theme at night"
          on={s.night.enabled}
          onChange={(enabled) => void change(windowChange('night', { enabled }))}
        />
        <WindowRow
          from={s.night.from}
          to={s.night.to}
          disabled={!s.night.enabled}
          onChange={(w) => void change(windowChange('night', w))}
        />
      </Group>
      <Group title="Idle">
        <ChoiceRow
          label="Return to Home after"
          hint="Minutes without a touch"
          value={String(s.idleHomeMinutes)}
          options={IDLE_CHOICES.map((m) => ({ value: String(m), label: m ? `${m} min` : 'Off' }))}
          onChange={(v) => void change({ idleHomeMinutes: Number(v) })}
        />
      </Group>
      <Group title="Sound">
        <ToggleRow
          label="Sounds"
          hint="Check-off pops, timer and message chimes, messages read aloud"
          on={s.sounds}
          onChange={(sounds) => void change({ sounds })}
        />
      </Group>
    </>
  );
}
