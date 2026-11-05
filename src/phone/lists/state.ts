import { computed, signal } from '@preact/signals';
import { asParent } from '../../core/lock';
import type { List } from '../../data/types';
import { listEditor } from '../../features/lists/ListCard';
import { clearDone, lists, restoreItems } from '../../features/lists/state';
import { plural } from '../../lib/text';
import { toast } from '../../ui/overlays';

/** The list open on the phone's Lists tab; null shows every list. */
export const openListId = signal<string | null>(null);
export const openList = computed(() => lists.value.find((l) => l.id === openListId.value) ?? null);

/** The open list's Add section field is up and focused (its menu's Add section). */
export const addingSection = signal(false);

export function showList(id: string): void {
  addingSection.value = false;
  openListId.value = id;
}

export function closeList(): void {
  addingSection.value = false;
  openListId.value = null;
}

export const newList = () => void asParent(() => (listEditor.value = {}), 'Enter the PIN to add a list.');

/** Clear the done items at once, with an Undo that brings them back (the phone's Clear done; the wall confirms first). */
export function clearDoneWithUndo(list: List): Promise<void> {
  return asParent(() => {
    const cleared = clearDone(list);
    if (!cleared.length) return;
    toast(`Cleared ${plural(cleared.length, 'done item')}`, {
      label: 'Undo',
      run: () => void asParent(() => restoreItems(cleared)),
    });
  }, 'Enter the PIN to clear done items.');
}
