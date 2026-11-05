import './wallscreen.css';
import { computed } from '@preact/signals';
import { Monitor, Moon, Sun } from 'lucide-preact';
import { sendDisplayCommand } from '../../core/display';
import { sleepNowEnd } from '../../core/sleep';
import { pairedDevice } from '../../data/session';
import { data, settings } from '../../data/store';
import { nowMs, today } from '../../lib/clock';
import { dateAt, formatTime } from '../../lib/date';
import { toast, useOpeningGuard } from '../../ui/overlays';
import type { MoreItem } from '../more/items';
import { describeCommand, wallAsleepGuess } from './logic';

/** Who sent a command or started the timer: "this phone", a paired phone's name, or null when not known. */
export function senderName(by: string | undefined): string | null {
  if (!by) return null;
  if (by === pairedDevice()) return 'this phone';
  return data.devices.value.find((d) => d.id === by)?.name ?? 'a phone since removed';
}

const command = computed(() => data.commands.value.find((c) => c.id === 'display'));

/** The wall asleep now, as far as this phone can tell (see wallAsleepGuess). */
export const wallSeemsAsleep = computed(() =>
  wallAsleepGuess(
    settings.value.sleep,
    command.value,
    data.timers.value.find((t) => t.id === 'wall'),
    nowMs.value,
  ),
);

export function askWall(kind: 'sleep' | 'wake'): void {
  sendDisplayCommand(kind, pairedDevice() ?? undefined);
  toast(kind === 'sleep' ? 'Asked the wall to sleep.' : 'Asked the wall to wake up.');
}

const hhmm = (t: string) => formatTime(dateAt(today.value, t), settings.value.timeFormat);

/** More > Wall screen: Sleep now and Wake up for the wall, and what was last asked. */
function WallScreen() {
  const guard = useOpeningGuard();
  const cmd = command.value;
  const fmt = settings.value.timeFormat;
  const asleep = wallSeemsAsleep.value;
  const sleep = settings.value.sleep;
  const until = formatTime(new Date(sleepNowEnd(sleep, nowMs.value)), fmt);
  return (
    <div class="ph-stack" onClickCapture={guard}>
      <section class={`ph-card pws-state${asleep ? ' asleep' : ''}`} aria-live="polite">
        <span class="pws-icon" aria-hidden="true">
          {asleep ? <Moon size="3rem" /> : <Sun size="3rem" />}
        </span>
        <div class="pws-state-text">
          <h2 class="ph-card-title">{asleep ? 'The wall is likely asleep' : 'The wall is likely awake'}</h2>
          <p class="muted">
            {cmd ? describeCommand(cmd, nowMs.value, fmt, senderName(cmd.by) ?? undefined) : 'Nothing asked from a phone yet.'}
          </p>
        </div>
      </section>
      <div class="pws-buttons">
        <button type="button" class="pws-btn" onClick={() => askWall('sleep')}>
          <Moon size="3.2rem" />
          <span>
            Sleep now
            <small>Until {until}</small>
          </span>
        </button>
        <button type="button" class="pws-btn" onClick={() => askWall('wake')}>
          <Sun size="3.2rem" />
          <span>
            Wake up
            <small>Until nobody has touched it for 3 minutes</small>
          </span>
        </button>
      </div>
      <p class="muted pws-note">
        {sleep.enabled
          ? `On its schedule, the wall sleeps from ${hhmm(sleep.from)} to ${hhmm(sleep.to)}.`
          : 'The wall has no sleep schedule. Set one on the wall under Sleep.'}{' '}
        A tap on the wall wakes it too.
      </p>
    </div>
  );
}

export const wallScreenItem: MoreItem = {
  id: 'wallscreen',
  label: 'Wall screen',
  icon: Monitor,
  hint: () => (wallSeemsAsleep.value ? 'Likely asleep' : 'Likely awake'),
  View: WallScreen,
};
