import { useEffect, useState } from 'preact/hooks';
import { Check, Plus, Timer } from 'lucide-preact';
import { countdowns } from '../../calendar/engine';
import type { CalEvent } from '../../calendar/types';
import { goTo } from '../../app/nav';
import { profiles, settings } from '../../data/store';
import type { Profile } from '../../data/types';
import { todayProgress } from '../../tasks/state';
import { Avatar } from '../../ui/profile';
import { countdownEmoji, fillStyle, whoOf } from './model';
import { Menu } from './Menu';
import { daysText } from './layout';
import { Avatars } from './parts';
import { countdownPopup, openDetail, openEditor } from './state';
import { plural } from '../../lib/text';

/** Under the top bar: countdown pill(s) and one task-progress pill per visible profile. */
export function ProgressStrip() {
  const f = settings.value.filter;
  const people = f.taskProgress ? profiles.value.filter((p) => !f.hiddenProfiles.includes(p.id)) : [];
  if (!people.length && !f.countdowns) return null;
  const progress = todayProgress.value;
  return (
    <div class="cal-strip">
      {f.countdowns && <CountdownPill wide={!people.length} />}
      {people.map((p) => {
        const pr = progress.get(p.id) ?? { done: 0, total: 0 };
        return <ProgressPill key={p.id} profile={p} done={pr.done} total={pr.total} />;
      })}
    </div>
  );
}

function ProgressPill({ profile, done, total }: { profile: Profile; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done >= total;
  return (
    <button
      type="button"
      class="cal-prog"
      style={{ '--c': profile.color, '--pct': `${pct}%` }}
      onClick={() => goTo('tasks')}
      aria-label={`${profile.name}: ${done} of ${plural(total, 'task')} done`}
    >
      <Avatar profile={profile} size={3.8} />
      <span class="cal-prog-name" dir="auto">
        {profile.name}
      </span>
      {total > 0 && <span class="cal-prog-count">{complete ? <Check size="2rem" strokeWidth={2.6} /> : `${done}/${total}`}</span>}
    </button>
  );
}

const ROTATE_MS = 8000;

/** The soonest countdown (rotating through the rest), or "Add countdown" when there are none. */
function CountdownPill({ wide }: { wide: boolean }) {
  const list = countdowns.value;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setI((x) => x + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [list.length]);
  if (!list.length)
    return (
      <button type="button" class="cal-cd cal-cd-add" onClick={() => openEditor({ countdown: true })}>
        <Plus size="2rem" />
        Add countdown
      </button>
    );
  const { ev, days } = list[i % list.length];
  return (
    <button
      type="button"
      class={`cal-cd${wide ? ' wide' : ''}`}
      style={fillStyle(ev, 'light')}
      onClick={(e) => (countdownPopup.value = (e.currentTarget as Element).getBoundingClientRect())}
    >
      <CountdownIcon ev={ev} />
      <span class="cal-cd-title" dir="auto">
        {ev.title}
      </span>
      <span class="cal-cd-days">{daysText(days)}</span>
      {list.length > 1 && <span class="cal-cd-n">+{list.length - 1}</span>}
    </button>
  );
}

function CountdownIcon({ ev }: { ev: CalEvent }) {
  const e = countdownEmoji(ev);
  return e ? <span class="cal-cd-emoji">{e}</span> : <Timer size="2.2rem" strokeWidth={1.8} />;
}

/** Every active countdown, soonest first; tap one for its details. */
export function CountdownList({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const list = countdowns.value;
  return (
    <Menu anchor={anchor} onClose={onClose} width={46} label="Countdowns">
      <h3 class="serif cal-cd-list-title">Countdowns</h3>
      {list.map(({ ev, days }) => (
        <button
          type="button"
          key={ev.key}
          class="cal-cd-row"
          onClick={(e) => {
            countdownPopup.value = null;
            openDetail(ev, e.currentTarget as Element);
          }}
        >
          <CountdownIcon ev={ev} />
          <span class="cal-cd-title" dir="auto">
            {ev.title}
          </span>
          <span class="cal-cd-days">{daysText(days)}</span>
          <Avatars who={whoOf(ev)} size={2.4} />
        </button>
      ))}
    </Menu>
  );
}
