import { useEffect } from 'preact/hooks';
import { CalendarDays, CalendarSearch, Plus } from 'lucide-preact';
import { unassigned } from '../../calendar/engine';
import type { ISODate } from '../../data/types';
import { today } from '../../lib/clock';
import { CalendarOverlays } from '../../features/calendar/Overlays';
import { openEditor } from '../../features/calendar/state';
import { IconButton } from '../../ui/controls';
import type { PhonePage } from '../nav';
import { Agenda } from './Agenda';
import { monthTitle } from './agenda';
import { agendaStart, calView, lookingAt } from './state';
import { ToAssign } from './ToAssign';
import '../../features/calendar/calendar.css';
import './calendar.css';

/** The tab's body: the agenda or To assign, and the calendar's sheets (event details, the editor). */
function CalendarBody() {
  // Coming back to the tab starts at today again.
  useEffect(
    () => () => {
      agendaStart.value = null;
    },
    [],
  );
  return (
    <>
      {calView.value === 'assign' ? <ToAssign /> : <Agenda />}
      <CalendarOverlays />
    </>
  );
}

/** Header buttons on the agenda: go to a date (the phone's own date picker), and add an event on the day looked at. */
function AgendaActions() {
  if (calView.value !== 'agenda') return null;
  const t = today.value;
  return (
    <div class="phc-actions">
      <label class="icon-btn phc-goto" title="Go to a date">
        <CalendarSearch size="2.4rem" strokeWidth={1.8} />
        <input
          type="date"
          aria-label="Go to a date"
          value={agendaStart.value ?? t}
          onClick={(e) => {
            try {
              (e.currentTarget as HTMLInputElement).showPicker();
            } catch {
              /* the tap opens the phone's picker itself */
            }
          }}
          onChange={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value as ISODate;
            if (v) agendaStart.value = v === today.peek() ? null : v;
          }}
        />
      </label>
      <IconButton label="Add event" onClick={() => openEditor({ day: lookingAt.value ?? today.value })}>
        <Plus size="2.8rem" strokeWidth={2.2} />
      </IconButton>
    </div>
  );
}

export const calendarPage: PhonePage = {
  id: 'calendar',
  label: 'Calendar',
  icon: CalendarDays,
  title: () => (calView.value === 'assign' ? 'To assign' : monthTitle(lookingAt.value ?? today.value, today.value)),
  Action: AgendaActions,
  back: () => (calView.value === 'assign' ? () => (calView.value = 'agenda') : null),
  Body: CalendarBody,
  badge: () => unassigned.value.length,
};
