import { increment } from 'firebase/firestore';
import { batch, data, householdId, put, remove, settings, transaction, whenConfirmed } from '../../data/store';
import type { GroceryMemory } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { itemKey, memoryId, memorySeed, planMemoryTidy } from './logic';

/**
 * The household's grocery memory (`groceryMemory`): every item put on a
 * grocery list, one document per item key (its id is memoryId(key)),
 * shared by all grocery lists and devices. Add item suggests from it
 * (suggest.ts); a suggestion can be forgotten. Each add counts (`count`,
 * by increment, so two devices adding at once both count) and keeps the
 * latest spelling and time.
 */

/** Remember items just put on a grocery list (typed, a suggestion tapped, a recipe's ingredients). */
export function remember(texts: readonly string[]): void {
  if (!texts.length) return;
  const at = currentTime();
  const b = batch();
  for (const text of texts) {
    const key = itemKey(text);
    if (!key) continue;
    const id = memoryId(key);
    b.upsert('groceryMemory', id, { id, key, text, lastAt: at, count: increment(1) as never });
  }
  void b.commit().catch((e: unknown) => console.warn('lists: grocery memory not written', e));
}

/** Forget a suggestion; returns an undo that puts it back as it was. */
export function forget(m: GroceryMemory): () => void {
  void remove('groceryMemory', m.id);
  return () => void put('groceryMemory', m);
}

/** What the wall's upkeep of the memory reads: it decides only once the server has answered for each. */
const MEMORY_DATA = ['settings', 'lists', 'listItems', 'groceryMemory'] as const;

/**
 * The wall's upkeep of the memory, once per start: tidy the documents an
 * earlier id or key rule wrote (planMemoryTidy), then, once in a
 * household's life (`settings.groceryMemorySince`), start the memory from
 * what the grocery lists hold (memorySeed). It waits until the server has
 * answered for what it reads, so a wall opening on a cold or stale cache
 * neither marks the memory started with nothing in it nor writes over
 * what phones added. The seed only creates documents (a transaction that
 * reads each first), so a count another device raised is never reset.
 */
export async function keepGroceryMemory(): Promise<void> {
  const hid = householdId.peek();
  await whenConfirmed(MEMORY_DATA);
  if (householdId.peek() !== hid) return;
  try {
    const docs = data.groceryMemory.peek();
    const tidy = planMemoryTidy(docs);
    if (tidy.write.length || tidy.remove.length) {
      const b = batch();
      tidy.write.forEach((d) => b.put('groceryMemory', d));
      tidy.remove.forEach((id) => b.remove('groceryMemory', id));
      await b.commit();
    }
    if (householdId.peek() !== hid || settings.peek().groceryMemorySince) return;
    // The ids the memory has once tidy.
    const have = new Set(docs.map((d) => memoryId(itemKey(d.text))));
    const seed = memorySeed(data.lists.peek(), data.listItems.peek(), have);
    await transaction(async (tx) => {
      if ((await tx.getSettings()).groceryMemorySince) return;
      const there = await Promise.all(seed.map((d) => tx.get('groceryMemory', d.id)));
      seed.forEach((d, i) => there[i] || tx.put('groceryMemory', d));
      tx.saveSettings({ groceryMemorySince: currentTime() });
    });
  } catch (e) {
    // The next start tries again: the tidy plan and the seed's mark follow from what is stored.
    console.warn('lists: grocery memory upkeep failed', e);
  }
}
