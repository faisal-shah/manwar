import { CalendarDays } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { today } from '../../lib/clock';
import { CalendarBody } from './CalendarBody';
import { NavControls } from './Controls';
import { CalendarOverlays } from './Overlays';
import { ProgressStrip } from './ProgressStrip';
import { createNav, navTitle, openEditor, periodOf, savedView } from './state';
import './calendar.css';

/** The Calendar tab's own paging state; the view is remembered on this device. */
const nav = createNav(savedView.value);
nav.onView = (v) => (savedView.value = v);

function Body() {
  return (
    <div class="cal-tab">
      <ProgressStrip />
      <CalendarBody nav={nav} />
      <CalendarOverlays />
    </div>
  );
}

/** New events start on the day being looked at in Day view, otherwise today. */
function addDay() {
  const p = periodOf(nav);
  return nav.view.value === 'day' ? p.from : p.from <= today.value && today.value <= p.to ? today.value : p.from;
}

export const calendarTab: TabDef = {
  id: 'calendar',
  label: 'Calendar',
  icon: CalendarDays,
  Controls: () => <NavControls nav={nav} />,
  Body,
  onAdd: () => openEditor({ day: addDay() }),
  title: () => navTitle(nav),
};
