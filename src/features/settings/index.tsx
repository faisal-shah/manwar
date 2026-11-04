import { sleepNow } from '../../core/display';
import { Button } from '../../ui/controls';
import { Modal, Sheet } from '../../ui/overlays';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Settings" onClose={onClose}>
      <p class="muted">Settings are being built.</p>
    </Sheet>
  );
}

export function SleepMenu({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Sleep" onClose={onClose}>
      <Button
        variant="primary"
        onClick={() => {
          sleepNow();
          onClose();
        }}
      >
        Enter sleep mode now
      </Button>
    </Modal>
  );
}
