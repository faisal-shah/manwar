import { CalendarDays } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { Empty } from '../../ui/controls';

export const calendarTab: TabDef = {
  id: 'calendar',
  label: 'Calendar',
  icon: CalendarDays,
  Body: () => <Empty emoji="🚧">Calendar is being built.</Empty>,
};
