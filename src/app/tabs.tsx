import type { TabId } from '../data/types';
import { unassigned } from '../calendar/engine';
import type { TabDef } from './tab';
import { homeTab, HomeOverlays } from '../features/home';
import { calendarTab } from '../features/calendar';
import { listsTab } from '../features/lists';
import { tasksTab } from '../features/tasks';
import { rewardsTab } from '../features/rewards';
import { mealsTab } from '../features/meals';
import { recipesTab } from '../features/recipes';
import { MessageOverlay } from '../features/messages';

/** Nav-rail order, as on the Skylight device. */
export const TABS: TabDef[] = [homeTab, calendarTab, listsTab, tasksTab, rewardsTab, mealsTab, recipesTab];

/** Full-screen layers owned by features (messages, timer). */
export function Overlays() {
  return (
    <>
      <HomeOverlays />
      <MessageOverlay />
    </>
  );
}

/** Counts shown on rail items: unassigned events wait in the Calendar triage queue. */
export function RailBadges(): Partial<Record<TabId, number>> {
  return { calendar: unassigned.value.length };
}
