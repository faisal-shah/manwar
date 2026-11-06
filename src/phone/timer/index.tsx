import './timer.css';
import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { AlarmClock, Timer as TimerIcon } from 'lucide-preact';
import { wallRequestError } from '../../data/errors';
import { pairedDevice } from '../../data/session';
import { settings } from '../../data/store';
import type { WallTimer } from '../../data/types';
import { STAGE_COLORS, formatDuration, timerStage, validMinutes } from '../../features/timer/logic';
import { startTimerFromPhone, stopTimerFromPhone, timer, timerPhase } from '../../features/timer/state';
import { nowMs, today } from '../../lib/clock';
import { formatTime, toISODate } from '../../lib/date';
import { Button } from '../../ui/controls';
import { toast, useOpeningTapGuard } from '../../ui/overlays';
import type { MoreItem } from '../more/items';
import { senderName } from '../wallscreen';
import { clockLeft } from '../../features/timer/logic';
import { PRESETS, minutesField } from './logic';

/** A start or stop on its way to the server: the buttons wait for its answer. */
const asking = signal(false);

/**
 * Ask the server to start or stop the wall's timer. `request` resolves
 * false when the wall's timer is not what this phone showed, which
 * `refused` explains; true once done (the view follows the snapshot).
 */
async function ask(request: () => Promise<boolean>, refused: string): Promise<boolean> {
  if (asking.peek()) return false;
  asking.value = true;
  try {
    if (await request()) return true;
    toast(refused);
  } catch (e) {
    toast(wallRequestError(e));
  } finally {
    asking.value = false;
  }
  return false;
}

/** More > Wall timer: start the wall's timer, watch it, stop it. */
function TimerView() {
  const t = timer.value;
  const phase = timerPhase.value;
  return (
    <div class="ph-stack">
      {/* Keyed by its run, so a timer started elsewhere in its place is a new view (and drops the tap that started it). */}
      {t && phase ? <Running key={t.run} t={t} phase={phase} /> : <StartTimer />}
      <p class="muted pt-note">The wall shows the timer full screen and chimes when it ends.</p>
    </div>
  );
}

function Running({ t, phase }: { t: WallTimer; phase: 'lead' | 'running' | 'done' }) {
  // The Stop button may be where the preset that started this timer was: the rest of that double tap must not stop it.
  const guard = useOpeningTapGuard();
  const n = nowMs.value;
  const total = t.minutes * 60_000;
  const left = Math.max(0, t.endAt - n);
  const fraction = phase === 'lead' ? 1 : left / total;
  const color = phase === 'done' ? STAGE_COLORS.red : STAGE_COLORS[timerStage(fraction)];
  const by = senderName(t.startedBy);
  const ends = `${toISODate(new Date(t.endAt)) === today.value ? '' : 'tomorrow '}${formatTime(new Date(t.endAt), settings.value.timeFormat)}`;
  return (
    <div class="ph-stack" {...guard}>
      <section class="ph-card pt-run" data-phase={phase}>
        <div class="pt-ring" style={{ '--left': fraction, '--pie': color }} role="timer" aria-live="off">
          <div class="pt-ring-inner">
            {phase === 'done' ? (
              <>
                <AlarmClock size="4rem" strokeWidth={1.8} />
                <span class="pt-big pt-word">Time's up</span>
              </>
            ) : phase === 'lead' ? (
              <>
                <span class="pt-big">{Math.max(1, Math.ceil((t.startAt - n) / 1000))}</span>
                <small>Starting</small>
              </>
            ) : (
              <>
                <span class="pt-big">{clockLeft(left)}</span>
                <small>left</small>
              </>
            )}
          </div>
        </div>
        <p class="pt-total">
          {formatDuration(t.minutes)} timer · ends {ends}
        </p>
        {by && <p class="muted pt-by">Started by {by}</p>}
      </section>
      <Button
        variant={phase === 'done' ? 'primary' : 'danger'}
        class="pt-stop"
        disabled={asking.value}
        onClick={() => void ask(() => stopTimerFromPhone(t), 'The wall started another timer meanwhile.')}
      >
        {phase === 'done' ? 'Done' : 'Stop timer'}
      </Button>
    </div>
  );
}

function StartTimer() {
  const [value, setValue] = useState('');
  const minutes = Number(value);
  const start = async (m: number) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const started = await ask(() => startTimerFromPhone(m, pairedDevice() ?? undefined), 'A timer was just started on the wall.');
    if (started) setValue('');
  };
  return (
    <>
      <section class="ph-card">
        <h2 class="ph-card-title">Start the wall's timer</h2>
        <div class="pt-presets">
          {PRESETS.map((m) => (
            <button
              type="button"
              class="pt-preset"
              key={m}
              aria-label={`${m} minutes`}
              disabled={asking.value}
              onClick={() => void start(m)}
            >
              <span class="num">{m}</span>
              <small>min</small>
            </button>
          ))}
        </div>
      </section>
      <section class="ph-card">
        <form
          class="pt-other"
          onSubmit={(e) => {
            e.preventDefault();
            if (validMinutes(minutes)) void start(minutes);
          }}
        >
          <label class="field-label" for="pt-minutes">
            Any number of minutes
          </label>
          <div class="pt-other-row">
            <input
              id="pt-minutes"
              class="input"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="go"
              placeholder="1 to 999"
              value={value}
              onInput={(e: TargetedEvent<HTMLInputElement>) => {
                const clean = minutesField(e.currentTarget.value);
                // Set the field too: when the cleaned text equals the state, no render would put it back.
                e.currentTarget.value = clean;
                setValue(clean);
              }}
            />
            <span class="pt-unit">min</span>
            <Button variant="primary" type="submit" disabled={!validMinutes(minutes) || asking.value}>
              Start
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}

export const timerItem: MoreItem = {
  id: 'timer',
  label: 'Wall timer',
  icon: TimerIcon,
  hint: () => {
    const t = timer.value;
    const phase = timerPhase.value;
    if (!t || !phase) return null;
    if (phase === 'done') return "Time's up";
    if (phase === 'lead') return 'Starting';
    return `${clockLeft(t.endAt - nowMs.value)} left`;
  },
  View: TimerView,
};
