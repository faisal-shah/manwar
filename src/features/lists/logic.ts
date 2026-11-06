import type { GroceryMemory, List, ListItem, ListKind, ListSection } from '../../data/types';
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

const byOrder = (a: ListItem, b: ListItem) => a.order - b.order || a.createdAt - b.createdAt;

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

/**
 * What putting a checked-off item back on its list ("add again") changes:
 * open, at `order`, in `sectionId` (null: none, the field deleted), with
 * `qty` when one was given. Only these are written, so a rename or move
 * made meanwhile on another device is kept.
 */
export function reopenedChanges(order: number, sectionId: string | null, qty?: string): Partial<ListItem> {
  return { done: false, order, sectionId: sectionId ?? undefined, ...(qty ? { qty } : {}) };
}

/**
 * The same item whole, for when it was deleted meanwhile on another device
 * (Clear done there) and the change is refused: written back complete.
 */
export function reopenedItem(prior: ListItem, order: number, sectionId: string | null, qty?: string): ListItem {
  const { doneAt: _doneAt, qty: priorQty, ...rest } = prior;
  const q = qty || priorQty;
  return { ...rest, ...reopenedChanges(order, sectionId), done: false, ...(q ? { qty: q } : {}) };
}

/** A row to put on a list: its name and the quantity given with it. */
export interface MergeRow {
  name: string;
  qty?: string;
}

/** What a list holds under one item key: the first open item, and the checked-off one checked last. */
export interface KeyedItems {
  open?: ListItem;
  done?: ListItem;
}

/** A list's items by item key: the one rule for "already on the list" and "add again". */
export function itemsByKey(items: readonly ListItem[]): Map<string, KeyedItems> {
  const out = new Map<string, KeyedItems>();
  for (const it of items) {
    const key = itemKey(it.text);
    const k = out.get(key) ?? {};
    if (!it.done) k.open ??= it;
    else if (!k.done || (it.doneAt ?? 0) > (k.done.doneAt ?? 0)) k.done = it;
    out.set(key, k);
  }
  return out;
}

/**
 * Where each row goes when several are put on a list at once, decided
 * from the list as it is now (`items`): a row already open there, or
 * repeated, is left out; a checked-off one (`prior`) comes back at the top
 * of its own section; a new one goes at the top of the unsectioned group.
 * Each group's rows keep the given order, above the items already open
 * there, with distinct orders.
 */
export function planMerge(
  list: List,
  items: ListItem[],
  rows: readonly MergeRow[],
): { row: MergeRow; prior?: ListItem; order: number }[] {
  const keyed = itemsByKey(items);
  const seen = new Set<string>();
  const placed: { row: MergeRow; prior?: ListItem; section: string | null }[] = [];
  for (const row of rows) {
    const key = itemKey(row.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const { open, done } = keyed.get(key) ?? {};
    if (open) continue;
    placed.push({ row, prior: done, section: done ? sectionOf(list, done) : null });
  }
  const next = new Map<string | null, number>();
  for (const p of placed) next.set(p.section, (next.get(p.section) ?? 0) + 1);
  for (const [s, n] of next) next.set(s, topOrder(list, items, s) - n + 1);
  return placed.map(({ row, prior, section }) => {
    const order = next.get(section)!;
    next.set(section, order + 1);
    return prior ? { row, prior, order } : { row, order };
  });
}

/**
 * Removed items an undo may put back: those on a list that still exists
 * whose id is free. A grocery item's id comes from its list and its key,
 * so a "milk" added again since has the id of the "milk" removed, and
 * putting the old one back would write over the new one.
 */
export function restorable(removed: readonly ListItem[], listIds: ReadonlySet<string>, itemIds: ReadonlySet<string>): ListItem[] {
  return removed.filter((i) => listIds.has(i.listId) && !itemIds.has(i.id));
}

/** What the item editor's fields hold on Save. */
export interface ItemEdit {
  text: string;
  qty: string;
  /** null: no section. */
  sectionId: string | null;
}

/**
 * The fields the item editor changed against the item as it opened
 * (`opened`; undefined deletes the field), so a change made meanwhile on
 * another device to a field left alone is kept. A new section puts the
 * item at `order()` in it.
 */
export function itemChanges(list: List, opened: ListItem, edit: ItemEdit, order: () => number): Partial<ListItem> {
  const out: Partial<ListItem> = {};
  const text = edit.text.trim();
  const qty = edit.qty.trim();
  if (text !== opened.text) out.text = text;
  if (qty !== (opened.qty ?? '')) out.qty = qty || undefined;
  if (edit.sectionId !== sectionOf(list, opened)) {
    out.sectionId = edit.sectionId ?? undefined;
    out.order = order();
  }
  return out;
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

/** A word without its English plural ending ("tomatoes" -> "tomato", "berries" -> "berry"). */
export function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(?:ch|sh|x|ss|o)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/**
 * The words of an item's name: the one tokenizer behind item keys and
 * grocery suggestions. Folded (case, accents, Arabic diacritics), without
 * parentheticals, the note after a comma (Latin or Arabic), punctuation
 * and emoji, and each word without the Arabic article ("الحليب" reads
 * "حليب"; the article alone is no word).
 */
export function itemWords(text: string): string[] {
  return fold(text)
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,،]/)[0]
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((w) => (w.startsWith('ال') ? w.slice(2) : w))
    .filter(Boolean);
}

/**
 * Key for "is this already on the list": the item's words with a plural
 * last word made singular ("Onions" = "onion", "Basmati rice (aged)" =
 * "basmati rice", "البيض" = "بيض"). Text with no letters or digits ("🍎")
 * is its own key.
 */
export function itemKey(text: string): string {
  const words = itemWords(text);
  if (!words.length) return text.trim().replace(/\s+/g, ' ');
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}

/* ---------- Grocery memory (memory.ts writes it) ---------- */

/** A grocery memory document's id: a hash of its item key, so any text makes a valid document id. */
export const memoryId = (key: string): string => hash53(key);

/**
 * The grocery memory the lists hold now (open and checked-off items), to
 * start it: each key counted as often as it is on the grocery lists, with
 * its latest spelling and time. Ids in `have` are left out.
 */
export function memorySeed(lists: readonly List[], items: readonly ListItem[], have: ReadonlySet<string>): GroceryMemory[] {
  const grocery = new Set(lists.filter((l) => l.kind === 'grocery').map((l) => l.id));
  const byId = new Map<string, GroceryMemory>();
  for (const item of items) {
    if (!grocery.has(item.listId)) continue;
    const key = itemKey(item.text);
    const id = memoryId(key);
    if (!key || have.has(id)) continue;
    const at = item.doneAt ?? item.createdAt;
    const seen = byId.get(id);
    if (!seen) byId.set(id, { id, key, text: item.text, count: 1, lastAt: at });
    else {
      seen.count++;
      if (at > seen.lastAt) Object.assign(seen, { text: item.text, lastAt: at });
    }
  }
  return [...byId.values()];
}

/**
 * Memory documents whose id or key does not follow from their text
 * (memoryId(itemKey(text)), as an earlier rule wrote them), merged into
 * the document they belong to: counts summed, the latest spelling and
 * time kept, written whole (`write`), the others removed (`remove`). The
 * same documents give the same plan on every wall, so two walls tidying
 * at once write the same. Empty once tidy.
 */
export function planMemoryTidy(docs: readonly GroceryMemory[]): { write: GroceryMemory[]; remove: string[] } {
  const groups = new Map<string, { key: string; docs: GroceryMemory[] }>();
  const remove: string[] = [];
  for (const d of docs) {
    const key = itemKey(d.text);
    if (!key) {
      remove.push(d.id);
      continue;
    }
    const id = memoryId(key);
    const g = groups.get(id);
    if (g) g.docs.push(d);
    else groups.set(id, { key, docs: [d] });
  }
  const write: GroceryMemory[] = [];
  for (const [id, { key, docs: group }] of groups) {
    if (group.length === 1 && group[0].id === id && group[0].key === key) continue;
    const latest = group.reduce((a, b) => (b.lastAt > a.lastAt ? b : a));
    write.push({ id, key, text: latest.text, count: group.reduce((n, d) => n + d.count, 0), lastAt: latest.lastAt });
    for (const d of group) if (d.id !== id) remove.push(d.id);
  }
  return { write, remove };
}
