import { effect, signal } from '@preact/signals';
import { UP_FOR_GRABS } from '../../data/types';
import { goPhone } from '../nav';

/*
 * Whose tasks the phone's Tasks tab shows: a profile id or UP_FOR_GRABS,
 * remembered on the phone. The stored choice is the person last picked; the
 * one shown falls back to the first person while it is not there (deleted,
 * or no Up for Grabs chores today), and the choice comes back with them.
 */
const KEY = 'manwar.phoneTasksFor.v1';

function load(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const tasksFor = signal<string | null>(typeof window === 'undefined' ? null : load());

if (typeof window !== 'undefined')
  effect(() => {
    const v = tasksFor.value;
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {
      /* no storage: the choice lasts for this session */
    }
  });

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

/** Open the Tasks tab on one person (or Up for Grabs). */
export function showTasksOf(id: string): void {
  tasksFor.value = id;
  goPhone('tasks');
}
