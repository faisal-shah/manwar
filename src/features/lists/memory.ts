import { increment } from 'firebase/firestore';
import { batch, data, put, remove, saveSettings, settings, settingsLoaded } from '../../data/store';
import type { GroceryMemory, ListItem } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { itemKey } from './logic';

/**
 * The household's grocery memory (`groceryMemory`): every item put on a
 * grocery list, one document per item key, shared by all grocery lists and
 * devices. Add item suggests from it (suggest.ts); a suggestion can be
 * forgotten. Each add counts (`count`, by increment, so two devices adding
 * at once both count) and keeps the latest spelling and time.
 */

/** A memory document's id: the item key, which may hold anything but a slash once encoded. */
export const memoryId = (key: string) => encodeURIComponent(key);

/** Firestore batches hold at most 500 writes. */
const BATCH_LIMIT = 450;

/** Remember items just put on a grocery list (typed, a suggestion tapped, a recipe's ingredients). */
export function remember(texts: readonly string[]): void {
  const at = currentTime();
  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const b = batch();
    for (const text of texts.slice(i, i + BATCH_LIMIT)) {
      const key = itemKey(text);
      if (!key) continue;
      b.upsert('groceryMemory', memoryId(key), { id: memoryId(key), key, text, lastAt: at, count: increment(1) as never });
    }
    void b.commit();
  }
}

/** Forget a suggestion; returns an undo that puts it back as it was. */
export function forget(m: GroceryMemory): () => void {
  void remove('groceryMemory', m.id);
  return () => void put('groceryMemory', m);
}

/**
 * Start the memory from what the grocery lists hold now (open and checked
 * off), once in a household's life (`settings.groceryMemorySince`): each
 * key counted as often as it is on the lists, with its latest spelling and
 * time. Keys the memory already has are left alone.
 */
export function seedMemory(): void {
  if (!settingsLoaded.peek() || settings.peek().groceryMemorySince) return;
  const grocery = new Set(
    data.lists
      .peek()
      .filter((l) => l.kind === 'grocery')
      .map((l) => l.id),
  );
  const have = new Set(data.groceryMemory.peek().map((m) => m.key));
  const byKey = new Map<string, { latest: ListItem; at: number; count: number }>();
  for (const item of data.listItems.peek()) {
    if (!grocery.has(item.listId)) continue;
    const key = itemKey(item.text);
    if (!key || have.has(key)) continue;
    const at = item.doneAt ?? item.createdAt;
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { latest: item, at, count: 1 });
    else {
      seen.count++;
      if (at > seen.at) Object.assign(seen, { latest: item, at });
    }
  }
  const docs: GroceryMemory[] = [...byKey].map(([key, s]) => ({
    id: memoryId(key),
    key,
    text: s.latest.text,
    count: s.count,
    lastAt: s.at,
  }));
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const b = batch();
    docs.slice(i, i + BATCH_LIMIT).forEach((d) => b.put('groceryMemory', d));
    void b.commit();
  }
  void saveSettings({ groceryMemorySince: currentTime() });
}
