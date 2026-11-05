import { CalendarDays } from 'lucide-preact';
import { unassigned } from '../../calendar/engine';
import type { PhonePage } from '../nav';
import { Placeholder } from '../placeholder';

export const calendarPage: PhonePage = {
  id: 'calendar',
  label: 'Calendar',
  icon: CalendarDays,
  Body: () => <Placeholder what="Calendar" />,
  badge: () => unassigned.value.length,
};
