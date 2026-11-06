import { EVERYONE } from '../data/types';

/**
 * Who an event or chore is for after tapping `id` among `value`. Everyone
 * is exclusive: tapping it chooses it alone (or clears it), and tapping a
 * person replaces it; a person is added or taken off.
 */
export function toggleAssignee(value: readonly string[], id: string): string[] {
  if (id === EVERYONE) return value.includes(EVERYONE) ? [] : [EVERYONE];
  const rest = value.filter((v) => v !== EVERYONE);
  return rest.includes(id) ? rest.filter((v) => v !== id) : [...rest, id];
}

/** The same ids (people, calendars), in any order. */
export const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));
