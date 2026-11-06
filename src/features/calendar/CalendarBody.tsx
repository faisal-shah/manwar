import { useEffect, useRef } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { ensureRange } from '../../calendar/engine';
import type { CalendarView } from '../../data/types';
import { addDays } from '../../lib/date';
import { useSwipe } from './gestures';
import { page, periodOf, type CalNav } from './state';
import { DayView } from './views/Day';
import { MonthView } from './views/Month';
import { ScheduleView } from './views/Schedule';
import { WeekView } from './views/Week';

const VIEWS: Record<CalendarView, FunctionComponent<{ nav: CalNav }>> = {
  schedule: ScheduleView,
  day: DayView,
  week: WeekView,
  month: MonthView,
};

/** The current view for a nav, with swipe paging and a slide-in on page turns. */
export function CalendarBody({ nav }: { nav: CalNav }) {
  const ref = useRef<HTMLDivElement>(null);
  useSwipe(ref, (dir) => page(nav, dir));
  const view = nav.view.value;
  const p = periodOf(nav);
  // The days on screen, and the week after them (Week view shows its range in the last cell), until the view pages on.
  useEffect(() => ensureRange(p.from, addDays(p.to, 7)), [p.from, p.to]);
  const View = VIEWS[view];
  const dir = nav.dir.value;
  return (
    <div ref={ref} class="cal-body" data-view={view} data-from={p.from}>
      <div key={`${view}:${p.from}`} class={`cal-page${dir ? (dir > 0 ? ' in-next' : ' in-prev') : ''}`}>
        <View nav={nav} />
      </div>
    </div>
  );
}
