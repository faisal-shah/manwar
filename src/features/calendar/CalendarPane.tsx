import { CalendarDays } from 'lucide-preact';
import { useLayoutEffect, useMemo } from 'preact/hooks';
import type { CalendarView } from '../../data/types';
import { CalendarBody } from './CalendarBody';
import { NavControls } from './Controls';
import { CalendarOverlays } from './Overlays';
import { createNav, navTitle } from './state';
import './calendar.css';

/**
 * The calendar body (any of the four views) with its own paging state, for
 * embedding in Home. The Calendar tab renders the same views full size.
 */
export function CalendarPane({ view, onViewChange }: { view: CalendarView; onViewChange: (v: CalendarView) => void }) {
  const nav = useMemo(() => createNav(view), []);
  nav.onView = onViewChange;
  useLayoutEffect(() => {
    if (nav.view.peek() === view) return;
    nav.view.value = view;
    nav.focus.value = null;
  }, [view]);
  const title = navTitle(nav);
  return (
    <section class="cal-pane" aria-label="Calendar">
      <header class="cal-pane-head">
        <h2 class="cal-pane-label">
          <CalendarDays size="1.8rem" strokeWidth={2} />
          Calendar
        </h2>
        <span class="cal-pane-title serif">{title}</span>
        <NavControls nav={nav} compact />
      </header>
      <CalendarBody nav={nav} />
      <CalendarOverlays />
    </section>
  );
}
