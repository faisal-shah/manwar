import type { TabId } from '../data/types';
import { unassigned } from '../calendar/engine';
import type { TabDef } from './tab';
import { homeTab } from '../features/home';
import { calendarTab } from '../features/calendar';
import { listsTab } from '../features/lists';
import { tasksTab } from '../features/tasks';
import { rewardsTab } from '../features/rewards';
import { mealsTab } from '../features/meals';
import { IngredientsHost } from '../features/meals/IngredientsModal';
import { recipesTab } from '../features/recipes';
import { MessageOverlay } from '../features/messages';
import { TimerOverlay } from '../features/timer';

/** Nav-rail order, as on the Skylight device. */
export const TABS: TabDef[] = [homeTab, calendarTab, listsTab, tasksTab, rewardsTab, mealsTab, recipesTab];

/** Layers owned by features: timer, messages, and the Add to grocery list modal (opened from any tab, e.g. a toast). */
export function Overlays() {
  return (
    <>
      <TimerOverlay />
      <MessageOverlay />
      <IngredientsHost />
    </>
  );
}

/** Counts shown on rail items: unassigned events wait in the Calendar triage queue. */
export function RailBadges(): Partial<Record<TabId, number>> {
  return { calendar: unassigned.value.length };
}
