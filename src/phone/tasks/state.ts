import { effect, signal } from '@preact/signals';
import { swallowRestOfTap } from '../../ui/overlays';
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

/** Open the Tasks tab on one person (or Up for Grabs), from a tap on another screen. */
export function showTasksOf(id: string): void {
  // The tasks open under the finger: the rest of a double tap must not check one off.
  swallowRestOfTap();
  tasksFor.value = id;
  goPhone('tasks');
}
