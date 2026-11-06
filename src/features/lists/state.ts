import { computed, signal } from '@preact/signals';
import { arrayUnion, deleteField } from 'firebase/firestore';
import { errorMessage } from '../../data/errors';
import { batch, data, fieldChanges, newId, patch, put, transaction } from '../../data/store';
import type { List, ListItem, ListKind, ListSection } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { toast } from '../../ui/overlays';
import {
  defaultGroceryList,
  groceryItemId,
  itemKey,
  nextDefaultGrocery,
  placeMerge,
  reopenedChanges,
  reopenedItem,
  sectionOf,
  topOrder,
  type MergeItem,
  type OrderPatch,
} from './logic';
import { remember } from './memory';

/** Reactive views of lists and their items, and every list write. Checking items off is open to everyone; callers wrap the rest in asParent(). */

export const lists = computed(() => [...data.lists.value].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt));

export const itemsByList = computed(() => {
  const m = new Map<string, ListItem[]>();
  for (const it of data.listItems.value) {
    const arr = m.get(it.listId);
    if (arr) arr.push(it);
    else m.set(it.listId, [it]);
  }
  return m;
});

export const groceryList = computed(() => defaultGroceryList(lists.value));

/** Items checked a moment ago: they show checked in place, then sink to Done. */
export const settling = signal<ReadonlySet<string>>(new Set());
const SETTLE_MS = 700;

/** Collapsed section headers (and Done groups), per device. Keys: section id or `done:<listId>`. */
const COLLAPSED_KEY = 'manwar.lists.collapsed';
function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
export const collapsed = signal<ReadonlySet<string>>(loadCollapsed());
export function toggleCollapsed(key: string): void {
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
  } catch {
    // Storage unavailable: collapse state lasts until reload.
  }
}

/* ---------- Items ---------- */

/** Say why a write the server refused rolled back here, instead of the items vanishing silently. */
const notSaved = (what: string) => (e: unknown) => {
  console.warn('lists: write refused', e);
  toast(`${what}: ${errorMessage(e)}`);
};

/**
 * A reopening refused because the item is gone from the server (deleted on
 * another device meanwhile, Clear done there): `whole` writes it back
 * complete while its list is still there. Any other refusal is said.
 */
const unlessGone = (listId: string, whole: () => Promise<void>, what: string) => (e: unknown) => {
  if ((e as { code?: string }).code === 'not-found' && lists.peek().some((l) => l.id === listId))
    return void whole().catch(notSaved(what));
  notSaved(what)(e);
};

const settleTimers = new Map<string, number>();

function unsettle(id: string): void {
  clearTimeout(settleTimers.get(id));
  settleTimers.delete(id);
  if (!settling.value.has(id)) return;
  const next = new Set(settling.value);
  next.delete(id);
  settling.value = next;
}

/** Check an item off (it settles in place, then sinks to Done) or back on (at once, even mid-settle). */
export function setDone(item: ListItem, done: boolean): void {
  unsettle(item.id);
  if (done) {
    settling.value = new Set([...settling.value, item.id]);
    settleTimers.set(
      item.id,
      window.setTimeout(() => unsettle(item.id), SETTLE_MS),
    );
  }
  void patch('listItems', item.id, done ? { done: true, doneAt: currentTime() } : { done: false });
}

export type AddResult = { kind: 'added' | 'reopened' | 'already'; item: ListItem };

/**
 * Add an item at the top of a section. On a grocery list, an item already
 * open there is not duplicated, and a checked-off one comes back instead
 * ("add again"): in its own section from the top field, in the section
 * typed into otherwise.
 */
export function addItem(list: List, text: string, sectionId: string | null, qty?: string): AddResult {
  const items = itemsByList.value.get(list.id) ?? [];
  if (list.kind === 'grocery') {
    const key = itemKey(text);
    const open = items.find((i) => !i.done && itemKey(i.text) === key);
    if (open) return { kind: 'already', item: open };
    const done = items.filter((i) => i.done && itemKey(i.text) === key).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))[0];
    remember([text]);
    if (done) {
      const section = sectionId ?? sectionOf(list, done);
      const order = topOrder(list, items, section);
      void patch('listItems', done.id, fieldChanges(reopenedChanges(order, section, qty)) as Partial<ListItem>).catch(
        unlessGone(list.id, () => put('listItems', reopenedItem(done, order, section, qty)), `"${done.text}" was not added back`),
      );
      return { kind: 'reopened', item: done };
    }
  }
  const item: ListItem = {
    id: list.kind === 'grocery' ? groceryItemId(list.id, text, items, newId) : newId(),
    listId: list.id,
    sectionId: sectionId ?? undefined,
    text,
    qty: qty || undefined,
    done: false,
    order: topOrder(list, items, sectionId),
    createdAt: currentTime(),
  };
  void put('listItems', item).catch(notSaved(`"${text}" was not added`));
  return { kind: 'added', item };
}

/**
 * Set text, quantity and section (empty quantity or no section removes the
 * field), and order when given. Only these fields are written, so a check-off
 * or reorder made meanwhile (here or on another device) is kept.
 */
export function updateItem(id: string, text: string, qty: string, sectionId: string | null, order?: number): void {
  const q = qty.trim();
  void patch('listItems', id, {
    text,
    qty: (q || deleteField()) as string,
    sectionId: (sectionId ?? deleteField()) as string,
    ...(order === undefined ? {} : { order }),
  });
}

export const deleteItem = (item: ListItem) => batch().remove('listItems', item.id).commit();

export function applyOrder(patches: OrderPatch[]): void {
  if (!patches.length) return;
  const b = batch();
  for (const p of patches) {
    const data: Record<string, unknown> = { order: p.order };
    if (p.sectionId !== undefined) data.sectionId = p.sectionId ?? deleteField();
    b.patch('listItems', p.id, data as never);
  }
  void b.commit();
}

/** Put several items on a list in one batch (see logic.placeMerge). Returns an undo that restores the list as it was. */
export function mergeItems(list: List, rows: MergeItem[]): () => void {
  const created: ListItem[] = [];
  /** Checked-off items that come back: what changes, the whole item, and what the undo puts back (only the fields the merge changed). */
  const reopens: { changes: Partial<ListItem>; whole: ListItem; was: Partial<ListItem> }[] = [];
  const now = currentTime();
  const items = itemsByList.value.get(list.id) ?? [];
  const taken = items.map((i) => ({ id: i.id }));
  const placed = placeMerge(list, items, rows);
  for (const { row, prior, order } of placed) {
    if (prior) {
      const changed: (keyof ListItem)[] = row.qty ? ['done', 'doneAt', 'order', 'qty'] : ['done', 'doneAt', 'order'];
      const section = sectionOf(list, prior);
      reopens.push({
        changes: reopenedChanges(order, section, row.qty),
        whole: reopenedItem(prior, order, section, row.qty),
        was: Object.fromEntries(changed.map((k) => [k, prior[k]])),
      });
      continue;
    }
    const item: ListItem = {
      id: list.kind === 'grocery' ? groceryItemId(list.id, row.name, taken, newId) : newId(),
      listId: list.id,
      text: row.name,
      qty: row.qty,
      done: false,
      order,
      createdAt: now,
    };
    created.push(item);
    taken.push({ id: item.id });
  }
  /** Undone before the server answered the batch: a retry has nothing to bring back. */
  let undone = false;
  // One batch. When an item it reopens was deleted meanwhile, the whole batch is refused: then it runs again on the
  // server, putting back whole only the items that are gone, so a rename made elsewhere to the others is kept.
  const b = batch();
  reopens.forEach((r) => b.patch('listItems', r.whole.id, fieldChanges(r.changes) as Partial<ListItem>));
  created.forEach((item) => b.put('listItems', item));
  const retry = async () => {
    if (undone) return;
    await transaction(async (tx) => {
      const gone = await Promise.all(reopens.map(async (r) => !(await tx.get('listItems', r.whole.id))));
      reopens.forEach((r, i) =>
        gone[i] ? tx.put('listItems', r.whole) : tx.patch('listItems', r.whole.id, fieldChanges(r.changes) as Partial<ListItem>),
      );
      created.forEach((item) => tx.put('listItems', item));
    });
  };
  void b.commit().catch(unlessGone(list.id, retry, `The items were not added to ${list.title}`));
  if (list.kind === 'grocery') remember(placed.map((p) => p.row.name));
  const reopened = reopens.map((r) => ({ id: r.whole.id, was: r.was }));
  return () => {
    undone = true;
    const u = batch();
    created.forEach((item) => u.remove('listItems', item.id));
    // Only the merged fields go back: a rename or move made since is kept, and an item deleted since stays deleted.
    const live = new Set((itemsByList.value.get(list.id) ?? []).map((i) => i.id));
    reopened.forEach(({ id, was }) => live.has(id) && u.patch('listItems', id, fieldChanges(was) as Partial<ListItem>));
    void u.commit();
  };
}

/** Remove the list's checked-off items; returns them, for restoreItems (an undo). */
export function clearDone(list: List): ListItem[] {
  const done = (itemsByList.value.get(list.id) ?? []).filter((i) => i.done);
  const b = batch();
  done.forEach((i) => b.remove('listItems', i.id));
  void b.commit();
  return done;
}

/**
 * Put removed items back as they were (an undo), onto lists that still
 * exist: not onto one deleted since on another device.
 */
export function restoreItems(items: ListItem[]): void {
  const live = new Set(lists.value.map((l) => l.id));
  const back = items.filter((i) => live.has(i.listId));
  if (!back.length) return;
  const b = batch();
  back.forEach((i) => b.put('listItems', i));
  void b.commit();
}

/* ---------- Lists ---------- */

export interface ListDraft {
  title: string;
  kind: ListKind;
  emoji?: string;
  color: string;
  sections: ListSection[];
  isDefaultGrocery: boolean;
}

/** Clear the default-grocery flag on every list but `keep`. */
function releaseDefault(b: ReturnType<typeof batch>, keep: string): void {
  for (const l of lists.value)
    if (l.id !== keep && l.isDefaultGrocery) b.patch('lists', l.id, { isDefaultGrocery: deleteField() as never });
}

/**
 * Create a list. Making it the default grocery list clears the flag
 * elsewhere; a new grocery list takes it when no grocery list has it (a new
 * to-do or other list only when asked).
 */
export function createList(draft: ListDraft): List {
  const all = lists.value;
  const list: List = {
    id: newId(),
    ...draft,
    emoji: draft.emoji || undefined,
    isDefaultGrocery: draft.isDefaultGrocery || (draft.kind === 'grocery' && !defaultGroceryList(all)) || undefined,
    order: all.length ? Math.max(...all.map((l) => l.order)) + 1 : 0,
    createdAt: currentTime(),
  };
  const b = batch().put('lists', list);
  if (list.isDefaultGrocery) releaseDefault(b, list.id);
  void b.commit();
  return list;
}

/**
 * Save the list editor over `opened`, the list as the editor opened it. Only
 * the fields the editor shows are written, a section added elsewhere
 * meanwhile is kept, and sections removed in the editor release their items.
 * False (nothing written) when the list was deleted meanwhile.
 */
export function updateList(opened: List, draft: ListDraft): boolean {
  const live = lists.value.find((l) => l.id === opened.id);
  if (!live) return false;
  const known = new Set(opened.sections.map((s) => s.id));
  const sections = [...draft.sections, ...live.sections.filter((s) => !known.has(s.id))];
  const b = batch().patch(
    'lists',
    live.id,
    fieldChanges({
      title: draft.title,
      kind: draft.kind,
      emoji: draft.emoji || undefined,
      color: draft.color,
      sections,
      isDefaultGrocery: draft.isDefaultGrocery || undefined,
    }) as Partial<List>,
  );
  if (draft.isDefaultGrocery) releaseDefault(b, live.id);
  const kept = new Set(sections.map((s) => s.id));
  for (const it of itemsByList.value.get(live.id) ?? [])
    if (it.sectionId && !kept.has(it.sectionId)) b.patch('listItems', it.id, { sectionId: deleteField() as never });
  void b.commit();
  return true;
}

/** Append a section; one added on another device at the same moment is kept too. */
export function addSection(list: List, name: string): ListSection {
  const section = { id: newId(), name };
  void patch('lists', list.id, { sections: arrayUnion(section) as never });
  return section;
}

/** Lists deleted on this device, so a view of one can tell its own delete from another device's. */
const deletedHere = new Set<string>();
export const deletedOnThisDevice = (id: string) => deletedHere.has(id);

/** Delete a list and its items; if it was the default grocery list, the next grocery list (if any) takes over. */
export function deleteList(list: List): void {
  deletedHere.add(list.id);
  const b = batch().remove('lists', list.id);
  for (const it of itemsByList.value.get(list.id) ?? []) b.remove('listItems', it.id);
  if (list.isDefaultGrocery) {
    const next = nextDefaultGrocery(lists.value, list.id);
    if (next) b.patch('lists', next.id, { isDefaultGrocery: true });
  }
  void b.commit();
}

/** The default grocery list, created when the household has none. */
export function ensureGroceryList(): List {
  const g = groceryList.value;
  if (g) return g;
  return createList({
    title: 'Grocery List',
    kind: 'grocery',
    emoji: '🛒',
    color: '#B5E085',
    sections: [],
    isDefaultGrocery: true,
  });
}
