import type { List, ListItem, ListKind, ListSection } from '../../data/types';
import { fold } from '../../lib/text';

/**
 * Pure list logic: grouping for display, ordering, reordering and the
 * default grocery list. No store access, so it is unit-tested directly.
 *
 * Ordering: open items sort by `order` within their section. New items go
 * to the top of their section (order = smallest - 1), so an item appears
 * right under the field it was typed into. Done items sink to one Done
 * group per list, most recently checked first (Cozi-style).
 */

export interface SectionGroup {
  /** null = items with no section, shown above the named sections. */
  section: ListSection | null;
  items: ListItem[];
}

export interface ListView {
  groups: SectionGroup[];
  done: ListItem[];
  /** Open (unchecked) items in the list. */
  open: number;
}

export const byOrder = (a: ListItem, b: ListItem) => a.order - b.order || a.createdAt - b.createdAt;

/** The section an item displays in; items pointing at a deleted section fall back to none. */
export function sectionOf(list: List, item: ListItem): string | null {
  return item.sectionId && list.sections.some((s) => s.id === item.sectionId) ? item.sectionId : null;
}

/**
 * Open items grouped by section (unsectioned first, then the list's section
 * order) and the Done group. Ids in `settling` were just checked: they keep
 * their place for a moment before sinking.
 */
export function groupItems(list: List, items: ListItem[], settling: ReadonlySet<string> = new Set()): ListView {
  const open = items.filter((i) => !i.done || settling.has(i.id));
  const groups: SectionGroup[] = [null, ...list.sections].map((section) => ({
    section,
    items: open.filter((i) => sectionOf(list, i) === (section?.id ?? null)).sort(byOrder),
  }));
  const done = items.filter((i) => i.done && !settling.has(i.id)).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return { groups, done, open: items.filter((i) => !i.done).length };
}

/** Order value that puts a new item above every open item of a section. */
export function topOrder(list: List, items: ListItem[], sectionId: string | null): number {
  const orders = items.filter((i) => !i.done && sectionOf(list, i) === sectionId).map((i) => i.order);
  return orders.length ? Math.min(...orders) - 1 : 0;
}

export interface OrderPatch {
  id: string;
  order: number;
  /** Present when the item changes section (null = no section). */
  sectionId?: string | null;
}

/**
 * Move `moved` to `index` among the open items of `sectionId` (index counts
 * the target's items without the moved one; clamped). `target` is that
 * section's open items in display order. Returns only the items whose order
 * or section changes; the target section is renumbered 0..n-1.
 */
export function reorder(
  target: ListItem[],
  moved: ListItem,
  sectionId: string | null,
  fromSection: string | null,
  index: number,
): OrderPatch[] {
  const seq = target.filter((i) => i.id !== moved.id);
  seq.splice(Math.max(0, Math.min(index, seq.length)), 0, moved);
  const out: OrderPatch[] = [];
  seq.forEach((it, order) => {
    const isMoved = it.id === moved.id;
    const sectionChanged = isMoved && fromSection !== sectionId;
    if (it.order !== order || sectionChanged) out.push(sectionChanged ? { id: it.id, order, sectionId } : { id: it.id, order });
  });
  return out;
}

export interface MergeItem {
  name: string;
  qty?: string;
  /** A checked-off item that comes back instead of a new one. */
  reopenId?: string;
}

/**
 * Where each merged row goes: new rows at the top of the unsectioned group,
 * checked-off ones (`prior`, when still on the list) back at the top of
 * their own section, each group's rows in the given order above the items
 * already open there, with distinct orders.
 */
export function placeMerge(
  list: List,
  items: ListItem[],
  rows: MergeItem[],
): { row: MergeItem; prior?: ListItem; order: number }[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const placed = rows.map((row) => {
    const prior = row.reopenId ? byId.get(row.reopenId) : undefined;
    return { row, prior, section: prior ? sectionOf(list, prior) : null };
  });
  const next = new Map<string | null, number>();
  for (const p of placed) next.set(p.section, (next.get(p.section) ?? 0) + 1);
  for (const [s, n] of next) next.set(s, topOrder(list, items, s) - n + 1);
  return placed.map(({ row, prior, section }) => {
    const order = next.get(section)!;
    next.set(section, order + 1);
    return prior ? { row, prior, order } : { row, order };
  });
}

/** Move an item one place up (-1) or down (+1) within its section. Empty when already at that end. */
export function moveBy(group: ListItem[], id: string, delta: -1 | 1, sectionId: string | null): OrderPatch[] {
  const idx = group.findIndex((i) => i.id === id);
  const next = idx + delta;
  if (idx < 0 || next < 0 || next >= group.length) return [];
  return reorder(group, group[idx], sectionId, sectionId, next);
}

/** The list recipe ingredients go to: the flagged one, else the first grocery list, else none. */
export function defaultGroceryList(lists: List[]): List | null {
  const sorted = [...lists].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  return sorted.find((l) => l.isDefaultGrocery) ?? sorted.find((l) => l.kind === 'grocery') ?? null;
}

/**
 * Which list becomes the default after `removedId` is deleted: the first
 * remaining grocery list, else none. Never a to-do or other list: the flag
 * would then outrank any grocery list made later, and ingredients would keep
 * landing on, say, the packing list. With none, the next "Add to grocery
 * list" makes a Grocery List (state.ensureGroceryList).
 */
export function nextDefaultGrocery(lists: List[], removedId: string): List | null {
  const rest = [...lists].filter((l) => l.id !== removedId).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  return rest.find((l) => l.kind === 'grocery') ?? null;
}

/** 53-bit string hash (cyrb53), base 36. Not for secrets: only to name a document after its text. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Document id for a new grocery item: the same on every device for one list
 * and one item key, so two phones adding "milk" at the same moment (neither
 * has seen the other's yet) write one item instead of two. When an item on
 * the list already has the id (one renamed since it was added), a fresh id
 * from `fresh` is used instead.
 */
export function groceryItemId(listId: string, text: string, items: Pick<ListItem, 'id'>[], fresh: () => string): string {
  const id = `${listId}-${hash53(itemKey(text))}`;
  return items.some((i) => i.id === id) ? fresh() : id;
}

/** Fallback card colors when a list has none (Skylight: grocery green, to-do blue). */
export const KIND_COLORS: Record<ListKind, string> = { grocery: '#B5E085', todo: '#93D1E5', other: '#F2B074' };

export const listColor = (l: Pick<List, 'color' | 'kind'>) => l.color ?? KIND_COLORS[l.kind];

function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(?:ch|sh|x|ss|o)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/**
 * Key for "is this already on the list": case- and accent-insensitive,
 * ignores parentheticals, text after a comma, punctuation, emoji and a
 * plural last word ("Onions" = "onion", "Basmati rice (aged)" = "basmati
 * rice"). Text with no letters or digits ("🍎") is its own key.
 */
export function itemKey(text: string): string {
  const words = fold(text)
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return text.trim().replace(/\s+/g, ' ');
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}
