import { useState } from 'preact/hooks';
import { Moon } from 'lucide-preact';
import { sleepNow } from '../../core/display';
import { asParent } from '../../core/lock';
import { changedFields, windowChange } from '../../data/settings';
import { saveSettings, settings } from '../../data/store';
import type { HHMM } from '../../data/types';
import { today } from '../../lib/clock';
import { dateAt, formatTime } from '../../lib/date';
import { Button } from '../../ui/controls';
import { Modal } from '../../ui/overlays';
import { ToggleRow, WindowRow, emptyWindow } from './parts';

/** The rail's Sleep button: the nightly schedule (a parent change) and "Sleep now" (anyone). */
export function SleepMenu({ onClose }: { onClose: () => void }) {
  // Save writes what was changed here since the menu opened, so another tablet's change to the rest stays.
  const [opened] = useState(settings.value.sleep);
  const [draft, setDraft] = useState(opened);
  const edits = changedFields(opened, draft);
  const dirty = Object.keys(edits).length > 0;
  const fmt = (t: HHMM) => formatTime(dateAt(today.value, t), settings.value.timeFormat);
  const save = () =>
    asParent(() => {
      void saveSettings(windowChange('sleep', edits));
      onClose();
    }, 'Enter the PIN to change the sleep schedule.');
  return (
    <Modal
      title="Sleep mode"
      onClose={onClose}
      actions={
        <>
          <Button
            class="sleep-now"
            onClick={() => {
              sleepNow();
              onClose();
            }}
          >
            <Moon size="2rem" />
            Enter sleep mode now
          </Button>
          <Button variant="primary" class="sleep-save" disabled={!dirty || emptyWindow(draft)} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <p class="muted sleep-intro">
        Sleep mode turns the screen off between the scheduled hours. Tap the screen anytime to wake it.
      </p>
      <div class="set-rows">
        <ToggleRow
          label="Sleep schedule"
          hint={draft.enabled ? `Every night, ${fmt(draft.from)} to ${fmt(draft.to)}` : 'Off'}
          on={draft.enabled}
          onChange={(enabled) => setDraft({ ...draft, enabled })}
        />
        <WindowRow from={draft.from} to={draft.to} disabled={!draft.enabled} onChange={(w) => setDraft({ ...draft, ...w })} />
      </div>
    </Modal>
  );
}
