import { UP_FOR_GRABS } from '../../data/types';

/** Pure helpers for the phone's Tasks tab (unit-tested). */

/**
 * The person shown: the stored choice while it is there, else the first
 * profile, else Up for Grabs when it has chores today; null when there is
 * nobody and nothing up for grabs.
 */
export function shownPerson(stored: string | null, profileIds: readonly string[], hasUpForGrabs: boolean): string | null {
  if (stored === UP_FOR_GRABS && hasUpForGrabs) return UP_FOR_GRABS;
  if (stored && profileIds.includes(stored)) return stored;
  if (profileIds.length) return profileIds[0];
  return hasUpForGrabs ? UP_FOR_GRABS : null;
}
