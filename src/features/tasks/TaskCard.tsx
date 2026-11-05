import { Check, Repeat, SkipForward, Star } from 'lucide-preact';
import { profileById, settings } from '../../data/store';
import { UP_FOR_GRABS } from '../../data/types';
import type { Occurrence } from '../../tasks/engine';
import { detailsFor, tapCheck } from './actions';
import { lateLabel, subtitle } from './logic';

/** Up for Grabs has no profile; it uses a calm teal like Skylight's house avatar. */
export const UFG_COLOR = '#3f9c97';

/**
 * A task card. With an emoji: the big tile (emoji on top, title, circle).
 * Without one, or `compact`: a single row. Tapping the circle checks it off;
 * tapping the card opens its details.
 */
export function TaskCard({ o, day, color, compact }: { o: Occurrence; day: string; color: string; compact?: boolean }) {
  const t = o.task;
  const done = o.state?.status === 'done';
  const skipped = o.state?.status === 'skipped';
  const big = !!t.emoji && !compact;
  const sub = subtitle(t, settings.value.timeFormat);
  const claimer = o.profileId === UP_FOR_GRABS && done ? profileById.value.get(o.state!.by) : undefined;
  const late = o.lateDays > 0 && !done;
  // A checked card shows the stars it earned, which a later edit of the task does not change.
  const stars = done ? o.state!.stars : t.stars;
  const meta = late || sub || stars > 0 || claimer || skipped;
  return (
    <div
      class={`tk-card${big ? ' big' : ' compact'}${done ? ' done' : ''}${skipped ? ' skipped' : ''}`}
      style={{ '--c': claimer?.color ?? color }}
      data-task={t.title}
    >
      <button
        type="button"
        class="tk-body"
        aria-label={`${t.title}, details`}
        onClick={(e) => {
          const card = (e.currentTarget as HTMLElement).closest('.tk-card')!;
          detailsFor.value = { o, day, anchor: card.getBoundingClientRect() };
        }}
      >
        {big && (
          <span class="tk-emoji" aria-hidden="true">
            {t.emoji}
          </span>
        )}
        <span class="tk-title">
          {!big && t.emoji && (
            <span class="tk-inline-emoji" aria-hidden="true">
              {t.emoji}
            </span>
          )}
          {t.title}
        </span>
        {meta && (
          <span class="tk-meta">
            {late && <span class="tk-late">{lateLabel(o.lateDays)}</span>}
            {sub && (
              <span class="tk-sub">
                {(t.repeat || t.repeatAfterDone) && <Repeat size="1.3rem" strokeWidth={2.4} />}
                {sub}
              </span>
            )}
            {stars > 0 && (
              <span class={`tk-stars${done ? ' earned' : ''}`}>
                <Star size="1.3rem" strokeWidth={2.4} />
                {stars}
              </span>
            )}
            {claimer && <span class="tk-chip">🏠 {claimer.name}</span>}
            {skipped && <span class="tk-chip">Skipped</span>}
          </span>
        )}
      </button>
      <button
        type="button"
        class="tk-check"
        aria-label={done ? `Uncheck ${t.title}` : skipped ? `Unskip ${t.title}` : `Complete ${t.title}`}
        aria-pressed={done}
        onClick={(e) => tapCheck(o, day, (e.currentTarget as HTMLElement).getBoundingClientRect())}
      >
        <span class="tk-circle">
          {done && <Check size="2.4rem" strokeWidth={3} />}
          {skipped && <SkipForward size="1.8rem" strokeWidth={2.4} />}
        </span>
      </button>
    </div>
  );
}
