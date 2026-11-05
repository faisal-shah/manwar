import { useState } from 'preact/hooks';
import { Moon } from 'lucide-preact';
import { sleepNow } from '../../core/display';
import { asParent } from '../../core/lock';
import { saveSettings, settings } from '../../data/store';
import type { HHMM } from '../../data/types';
import { today } from '../../lib/clock';
import { dateAt, formatTime } from '../../lib/date';
import { Button } from '../../ui/controls';
import { Modal } from '../../ui/overlays';
import { ToggleRow, WindowRow, emptyWindow } from './parts';

/** The rail's Sleep button: the nightly schedule (a parent change) and "Sleep now" (anyone). */
export function SleepMenu({ onClose }: { onClose: () => void }) {
  const saved = settings.value.sleep;
  const [draft, setDraft] = useState(saved);
  const dirty = draft.enabled !== saved.enabled || draft.from !== saved.from || draft.to !== saved.to;
  const fmt = (t: HHMM) => formatTime(dateAt(today.value, t), settings.value.timeFormat);
  const save = () =>
    asParent(() => {
      void saveSettings({ sleep: draft });
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
