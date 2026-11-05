import { useEffect, useState } from 'preact/hooks';
import { AlarmClock, Delete, Timer as TimerIcon, X } from 'lucide-preact';
import { sleeping, wake } from '../../core/display';
import { playChime } from '../../core/sound';
import { settings } from '../../data/store';
import { nowMs, today } from '../../lib/clock';
import { formatTime, toISODate } from '../../lib/date';
import { Button } from '../../ui/controls';
import { Modal } from '../../ui/overlays';
import { STAGE_COLORS, formatDuration, pressKey, splitRemaining, timerStage, validMinutes, type KeypadKey } from './logic';
import { startTimer, stopTimer, timer, timerPhase } from './state';
import './timer.css';

export { timerActive } from './state';

/** Top-bar Timer button (Home tab): opens the minutes keypad. */
export function TimerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" class="ctl timer-btn" onClick={() => setOpen(true)}>
        <TimerIcon size="2.2rem" strokeWidth={2} />
        Timer
      </button>
      {open && <TimerKeypad onClose={() => setOpen(false)} />}
    </>
  );
}

const DIGITS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function TimerKeypad({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('');
  const minutes = Number(value);
  const ok = validMinutes(minutes);
  const press = (k: KeypadKey) => setValue((v) => pressKey(v, k));
  const start = () => {
    startTimer(minutes);
    onClose();
  };
  return (
    <Modal
      title="Timer"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" class="timer-start" disabled={!ok} onClick={start}>
            Start
          </Button>
        </>
      }
    >
      <div class="timer-entry" aria-live="polite" aria-label={`${value || 0} minutes`}>
        <span class={value ? '' : 'placeholder'}>{value || '0'}</span>
        <small>min</small>
      </div>
      <div class="pin-keys timer-keys">
        {DIGITS.map((d) => (
          <button type="button" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" class="word" onClick={() => press('clear')}>
          Clear
        </button>
        <button type="button" onClick={() => press('0')}>
          0
        </button>
        <button type="button" aria-label="Backspace" onClick={() => press('back')}>
          <Delete size="3rem" strokeWidth={1.8} />
        </button>
      </div>
      <p class="muted timer-hint">1 to 999 minutes</p>
    </Modal>
  );
}

const CHIMES = 4;
const CHIME_GAP_MS = 2400;

/** Chime a few times when the timer reaches zero, waking the screen if "Sleep now" blanked it. */
function useTimesUpChime(ringing: boolean) {
  useEffect(() => {
    if (!ringing) return;
    if (sleeping.value) wake();
    playChime();
    let played = 1;
    const id = setInterval(() => {
      playChime();
      if (++played >= CHIMES) clearInterval(id);
    }, CHIME_GAP_MS);
    return () => clearInterval(id);
  }, [ringing]);
}

/** Full-screen running timer. */
export function TimerOverlay() {
  const t = timer.value;
  const phase = timerPhase.value;
  useTimesUpChime(phase === 'done');
  if (!t || !phase) return null;
  const n = nowMs.value;
  const total = t.minutes * 60_000;
  const left = Math.max(0, t.endAt - n);
  const fraction = phase === 'lead' ? 1 : left / total;
  const { mins, secs } = splitRemaining(phase === 'lead' ? total : left);
  const stage = timerStage(fraction);
  return (
    <div class="timer-layer" data-phase={phase} role="dialog" aria-label="Timer">
      <button type="button" class="timer-close" aria-label="Stop timer" onClick={stopTimer}>
        <X size="3.6rem" strokeWidth={2} />
      </button>
      {phase === 'done' ? (
        <div class="timer-done">
          <div class="timer-ring tint-solid" style={{ '--c': STAGE_COLORS.red }}>
            <AlarmClock size="9rem" strokeWidth={1.6} />
            <span>Time's up</span>
          </div>
          <p class="timer-done-sub">{formatDuration(t.minutes)} timer</p>
          <Button variant="primary" class="timer-done-btn" onClick={stopTimer}>
            Done
          </Button>
        </div>
      ) : (
        <>
          <div class="timer-pie" style={{ '--left': fraction, '--pie': STAGE_COLORS[stage] }} data-stage={stage}>
            {phase === 'lead' && (
              <span class="timer-lead" key={Math.ceil((t.startAt - n) / 1000)}>
                {Math.max(1, Math.ceil((t.startAt - n) / 1000))}
              </span>
            )}
          </div>
          <div class="timer-readout">
            {/* Three-digit minutes take smaller numerals, so the readout stays clear of the pie. */}
            <div class="timer-clock" data-digits={String(mins).length} aria-label={`${mins} minutes ${secs} seconds left`}>
              <div>
                <span class="num">{mins}</span>
                <small>mins</small>
              </div>
              <div class="secs">
                <span class="num">{String(secs).padStart(2, '0')}</span>
                <small>sec</small>
              </div>
            </div>
            <div class="timer-total">
              {formatDuration(t.minutes)}
              <span class="muted">
                {' '}
                · ends {toISODate(new Date(t.endAt)) === today.value ? '' : 'tomorrow '}
                {formatTime(new Date(t.endAt), settings.value.timeFormat)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
