import { useState } from 'preact/hooks';
import { ArrowLeft, ChevronRight, Lock, LockOpen } from 'lucide-preact';
import { asParent, lockEnabled, lockNow, setPin } from '../../core/lock';
import { relockChange } from '../../data/settings';
import { settings } from '../../data/store';
import { Button, Stepper } from '../../ui/controls';
import { confirm, toast } from '../../ui/overlays';
import { Group, NavRow, PageTitle, Row, change } from './parts';

const REASON = 'Enter the current PIN to change the lock.';

export function LockPage({ onClose }: { onClose: () => void }) {
  const [choosing, setChoosing] = useState(false);
  const on = lockEnabled.value;
  const lock = settings.value.lock;
  if (choosing) return <PinSetup changing={on} onDone={() => setChoosing(false)} />;

  const removePin = async () => {
    const ok = await confirm('Remove the PIN?', {
      body: 'Anyone at the wall will be able to add, change and delete everything.',
      ok: 'Remove PIN',
      danger: true,
    });
    if (ok)
      await asParent(() => {
        void setPin(null);
        toast('The parental lock is off.');
      }, REASON);
  };

  return (
    <>
      <PageTitle>Parental lock</PageTitle>
      <Group>
        <Row
          lead={on ? <Lock size="2.6rem" /> : <LockOpen size="2.6rem" class="muted" />}
          label={on ? 'The lock is on' : 'The lock is off'}
          hint={
            on
              ? 'Without the PIN, anyone can look around and check off tasks. Adding, changing and deleting ask for the PIN.'
              : 'Anyone at the wall can change everything. Set a PIN to put the wall in kid mode.'
          }
        />
      </Group>
      {on ? (
        <>
          <Group>
            <NavRow
              label="Change PIN"
              trail={<ChevronRight size="2.4rem" class="muted" />}
              onClick={() => void asParent(() => setChoosing(true), REASON)}
            />
            <Row label="Lock again after" hint="Minutes without a touch, once the PIN was entered">
              <Stepper value={lock.relockMinutes} min={1} max={10} onChange={(m) => void change(relockChange(m))} />
            </Row>
            <NavRow label={<span class="set-error">Remove PIN</span>} onClick={() => void removePin()} />
          </Group>
          <Button
            variant="primary"
            class="set-big"
            onClick={() => {
              lockNow();
              onClose();
              toast('Locked. Changes need the PIN.');
            }}
          >
            <Lock size="2rem" />
            Lock now
          </Button>
        </>
      ) : (
        <Group>
          <NavRow
            label="Set a PIN"
            hint="4 digits"
            trail={<ChevronRight size="2.4rem" class="muted" />}
            onClick={() => setChoosing(true)}
          />
        </Group>
      )}
    </>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Enter a new PIN twice; a mismatch starts over. */
function PinSetup({ changing, onDone }: { changing: boolean; onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPinValue] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const press = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPinValue(next);
    setMismatch(false);
    if (next.length < 4) return;
    if (first === null) {
      setTimeout(() => {
        setFirst(next);
        setPinValue('');
      }, 200);
    } else if (next === first) {
      void asParent(() => {
        void setPin(next);
        toast(changing ? 'The PIN was changed.' : 'The PIN is set. The wall is in kid mode once it locks.');
        onDone();
      }, REASON);
    } else {
      setMismatch(true);
      setTimeout(() => {
        setFirst(null);
        setPinValue('');
      }, 400);
    }
  };

  return (
    <>
      <button type="button" class="set-back" onClick={onDone}>
        <ArrowLeft size="2.2rem" />
        Parental lock
      </button>
      <div class="pin-setup">
        <PageTitle>{first === null ? (changing ? 'Choose a new PIN' : 'Choose a 4-digit PIN') : 'Enter the PIN again'}</PageTitle>
        <p class={mismatch ? 'set-error' : 'muted'}>
          {mismatch
            ? 'The two PINs did not match. Start again.'
            : first === null
              ? 'Parents use it to add, change and delete.'
              : 'To make sure it is right.'}
        </p>
        <div class={`pin-dots${mismatch ? ' shake' : ''}`} aria-label={`${pin.length} of 4 digits`}>
          {[0, 1, 2, 3].map((i) => (
            <span class={i < pin.length ? 'on' : ''} />
          ))}
        </div>
        <div class="pin-keys">
          {KEYS.map((d) => (
            <button type="button" onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button type="button" class="word" onClick={onDone}>
            Cancel
          </button>
          <button type="button" onClick={() => press('0')}>
            0
          </button>
          <button type="button" class="word" onClick={() => setPinValue(pin.slice(0, -1))}>
            Delete
          </button>
        </div>
      </div>
    </>
  );
}
