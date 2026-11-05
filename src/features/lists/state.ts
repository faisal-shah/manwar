import { computed, signal } from '@preact/signals';
import { deleteField } from 'firebase/firestore';
import { batch, data, newId, patch, put } from '../../data/store';
import type { List, ListItem, ListKind, ListSection } from '../../data/types';
import { currentTime } from '../../lib/clock';
import {
  defaultGroceryList,
  itemKey,
  nextDefaultGrocery,
  placeMerge,
  sectionOf,
  topOrder,
  type MergeItem,
  type OrderPatch,
} from './logic';

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
    if (done) {
      const own = sectionOf(list, done);
      const section = sectionId ?? own;
      void patch('listItems', done.id, {
        done: false,
        order: topOrder(list, items, section),
        ...(section === own ? {} : { sectionId: (section ?? deleteField()) as string }),
        ...(qty ? { qty } : {}),
      });
      return { kind: 'reopened', item: done };
    }
  }
  const item: ListItem = {
    id: newId(),
    listId: list.id,
    sectionId: sectionId ?? undefined,
    text,
    qty: qty || undefined,
    done: false,
    order: topOrder(list, items, sectionId),
    createdAt: currentTime(),
  };
  void put('listItems', item);
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
  const b = batch();
  const created: string[] = [];
  const reopened: ListItem[] = [];
  const now = currentTime();
  for (const { row, prior, order } of placeMerge(list, itemsByList.value.get(list.id) ?? [], rows)) {
    if (prior) {
      reopened.push(prior);
      b.patch('listItems', prior.id, { done: false, order, ...(row.qty ? { qty: row.qty } : {}) });
      continue;
    }
    const item: ListItem = {
      id: newId(),
      listId: list.id,
      text: row.name,
      qty: row.qty,
      done: false,
      order,
      createdAt: now,
    };
    created.push(item.id);
    b.put('listItems', item);
  }
  void b.commit();
  return () => {
    const u = batch();
    created.forEach((id) => u.remove('listItems', id));
    reopened.forEach((it) => u.put('listItems', it));
    void u.commit();
  };
}

export function clearDone(list: List): number {
  const done = (itemsByList.value.get(list.id) ?? []).filter((i) => i.done);
  const b = batch();
  done.forEach((i) => b.remove('listItems', i.id));
  void b.commit();
  return done.length;
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

/**
 * Create or update a list. Making it the default grocery list clears the
 * flag elsewhere; a new grocery list takes it when no grocery list has it
 * (a new to-do or other list only when asked); removed sections release
 * their items.
 */
export function saveList(draft: ListDraft, existing?: List): List {
  const all = lists.value;
  const b = batch();
  const list: List = existing
    ? { ...existing, ...draft, emoji: draft.emoji || undefined, isDefaultGrocery: draft.isDefaultGrocery || undefined }
    : {
        id: newId(),
        ...draft,
        emoji: draft.emoji || undefined,
        isDefaultGrocery: draft.isDefaultGrocery || (draft.kind === 'grocery' && !defaultGroceryList(all)) || undefined,
        order: all.length ? Math.max(...all.map((l) => l.order)) + 1 : 0,
        createdAt: currentTime(),
      };
  b.put('lists', list);
  if (list.isDefaultGrocery)
    for (const l of all)
      if (l.id !== list.id && l.isDefaultGrocery) b.patch('lists', l.id, { isDefaultGrocery: deleteField() as never });
  if (existing) {
    const kept = new Set(list.sections.map((s) => s.id));
    for (const it of itemsByList.value.get(existing.id) ?? [])
      if (it.sectionId && !kept.has(it.sectionId)) b.patch('listItems', it.id, { sectionId: deleteField() as never });
  }
  void b.commit();
  return list;
}

export function addSection(list: List, name: string): ListSection {
  const section = { id: newId(), name };
  void patch('lists', list.id, { sections: [...list.sections, section] });
  return section;
}

/** Delete a list and its items; if it was the default grocery list, the next grocery list (if any) takes over. */
export function deleteList(list: List): void {
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
  return saveList({
    title: 'Grocery List',
    kind: 'grocery',
    emoji: '🛒',
    color: '#B5E085',
    sections: [],
    isDefaultGrocery: true,
  });
}
