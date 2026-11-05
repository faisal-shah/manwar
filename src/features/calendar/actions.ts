import { assign, deleteEvent, setCountdown } from '../../calendar/engine';
import type { CalEvent, EditScope } from '../../calendar/types';
import { asParent } from '../../core/lock';
import { errorMessage } from '../../data/errors';
import { choose, confirm, toast } from '../../ui/overlays';

/** Mutations started from the calendar UI. Each one goes through the parental lock. */

const SCOPES: { value: EditScope; label: string }[] = [
  { value: 'this', label: 'This event' },
  { value: 'following', label: 'This and following events' },
  { value: 'all', label: 'All events' },
];

/**
 * For a recurring event, ask which occurrences a change applies to. Null =
 * cancelled. A changed repeat rule belongs to the series, so `seriesOnly`
 * leaves out "This event" (one occurrence cannot repeat differently).
 */
export async function askScope(ev: CalEvent, title: string, seriesOnly = false): Promise<EditScope | null> {
  if (!ev.seriesId) return 'all';
  return choose(title, seriesOnly ? SCOPES.filter((s) => s.value !== 'this') : SCOPES);
}

export function errorToast(what: string, e: unknown): void {
  toast(`${what}: ${errorMessage(e)}`);
}

/**
 * Delete with confirmation (scope choice for series). Resolves true when the
 * event was deleted. `busy` toggles the caller's progress state.
 */
export async function deleteFlow(ev: CalEvent, busy: (on: boolean) => void): Promise<boolean> {
  let done = false;
  await asParent(async () => {
    let scope: EditScope = 'all';
    if (ev.seriesId) {
      const s = await askScope(ev, 'Delete recurring event');
      if (!s) return;
      scope = s;
    } else if (
      !(await confirm('Delete event?', { body: `"${ev.title}" will be removed from the calendar.`, ok: 'Delete', danger: true }))
    )
      return;
    busy(true);
    try {
      await deleteEvent(ev, scope);
      toast('Event deleted');
      done = true;
    } catch (e) {
      errorToast('Could not delete the event', e);
    } finally {
      busy(false);
    }
  }, 'Enter the PIN to delete events.');
  return done;
}

/** Assign profiles (series-level unless `scope` says otherwise). */
export function assignFlow(ev: CalEvent, ids: string[], scope: 'series' | 'instance' = 'series'): Promise<void> {
  return asParent(() => assign(ev, ids, scope), 'Enter the PIN to assign events.');
}

export function countdownFlow(ev: CalEvent, on: boolean): Promise<void> {
  return asParent(() => setCountdown(ev, on), 'Enter the PIN to change countdowns.');
}
