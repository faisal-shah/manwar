import { profiles } from '../../data/store';
import { today } from '../../lib/clock';
import { todayOccurrences } from '../../tasks/state';
import { ColumnHead, NoColumns, useStartInView } from './DayView';
import { buildColumns, isAllDone } from './logic';
import { TaskCard, UFG_COLOR } from './TaskCard';
import { TasksOverlays } from './overlays';
import { taskFilter } from './view';
import './columns.css';
import './tasks.css';

/**
 * Home's "Today's tasks" pane: one card per profile (Up for Grabs first when
 * it has chores) with today's tasks as compact rows to check off. Fills its
 * container; cards scroll sideways when they do not fit. The host draws the
 * pane frame and title.
 */
export function TodayTasksPane() {
  const day = today.value;
  const cols = buildColumns(todayOccurrences.value, profiles.value, taskFilter.value);
  const start = useStartInView(cols[0]?.id);
  if (!cols.length) return <NoColumns />;
  return (
    <div class="tp">
      <div class="tp-cards" data-count={cols.length} ref={start.ref} onScroll={start.onScroll}>
        {cols.map((c) => {
          const color = c.profile?.color ?? UFG_COLOR;
          return (
            <section
              class="pcol tp-card"
              style={{ '--c': color }}
              key={c.id}
              data-column={c.id}
              aria-label={c.profile?.name ?? 'Up for Grabs'}
            >
              <ColumnHead col={c} />
              <div class="tp-list scroll">
                {c.occ.length ? (
                  c.occ.map((o) => <TaskCard key={o.id} o={o} day={day} color={color} compact />)
                ) : (
                  <div class="tp-empty">
                    <span aria-hidden="true">{isAllDone(c.all) ? '🎉' : '🙌'}</span>
                    {isAllDone(c.all) ? 'All done!' : 'Nothing to do today.'}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <TasksOverlays />
    </div>
  );
}
