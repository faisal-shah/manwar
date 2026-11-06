import { describe, expect, it } from 'vitest';
import type { GroceryMemory, List, ListItem } from '../../src/data/types';
import {
  defaultGroceryList,
  groceryItemId,
  groupItems,
  itemChanges,
  itemKey,
  itemsByKey,
  itemWords,
  memoryId,
  memorySeed,
  moveBy,
  nextDefaultGrocery,
  planMemoryTidy,
  planMerge,
  reopenedChanges,
  reopenedItem,
  reorder,
  restorable,
  topOrder,
} from '../../src/features/lists/logic';

const list = (p: Partial<List> = {}): List => ({
  id: 'g',
  title: 'Grocery List',
  kind: 'grocery',
  sections: [
    { id: 'prod', name: 'Produce' },
    { id: 'dairy', name: 'Dairy' },
  ],
  order: 0,
  createdAt: 0,
  ...p,
});
let seq = 0;
const item = (text: string, p: Partial<ListItem> = {}): ListItem => ({
  id: text.toLowerCase().replace(/\s+/g, '-'),
  listId: 'g',
  text,
  done: false,
  order: seq++,
  createdAt: 0,
  ...p,
});

describe('groupItems', () => {
  it('puts unsectioned items first, then sections in list order, each by order', () => {
    const items = [
      item('Milk', { sectionId: 'dairy', order: 2 }),
      item('Yogurt', { sectionId: 'dairy', order: 1 }),
      item('Pepper', { order: 5 }),
      item('Spinach', { sectionId: 'prod', order: 0 }),
    ];
    const v = groupItems(list(), items);
    expect(v.groups.map((g) => [g.section?.name ?? null, g.items.map((i) => i.text)])).toEqual([
      [null, ['Pepper']],
      ['Produce', ['Spinach']],
      ['Dairy', ['Yogurt', 'Milk']],
    ]);
    expect(v.open).toBe(4);
  });

  it('sinks done items to one Done group, most recently checked first', () => {
    const items = [
      item('Oil', { done: true, doneAt: 10, sectionId: 'prod' }),
      item('Rice', { done: true, doneAt: 30 }),
      item('Eggs'),
    ];
    const v = groupItems(list(), items);
    expect(v.done.map((i) => i.text)).toEqual(['Rice', 'Oil']);
    expect(v.groups.flatMap((g) => g.items).map((i) => i.text)).toEqual(['Eggs']);
    expect(v.open).toBe(1);
  });

  it('keeps a just-checked item in place while it settles', () => {
    const items = [item('Rice', { done: true, doneAt: 30 }), item('Eggs', { order: 0 })];
    const v = groupItems(list(), items, new Set(['rice']));
    expect(v.groups[0].items.map((i) => i.text)).toContain('Rice');
    expect(v.done).toEqual([]);
    expect(v.open).toBe(1);
  });

  it('shows items of a deleted section as unsectioned', () => {
    const v = groupItems(list(), [item('Bread', { sectionId: 'gone' })]);
    expect(v.groups[0].items.map((i) => i.text)).toEqual(['Bread']);
  });
});

describe('ordering', () => {
  it('topOrder goes above the open items of that section only', () => {
    const items = [item('A', { order: 3 }), item('B', { order: -2, sectionId: 'prod' }), item('C', { order: -9, done: true })];
    expect(topOrder(list(), items, null)).toBe(2);
    expect(topOrder(list(), items, 'prod')).toBe(-3);
    expect(topOrder(list(), items, 'dairy')).toBe(0);
  });

  it('reorder renumbers the target and patches only what changed', () => {
    const a = item('A', { order: 0 });
    const b = item('B', { order: 1 });
    const c = item('C', { order: 2 });
    expect(reorder([a, b, c], c, null, null, 0)).toEqual([
      { id: 'c', order: 0 },
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
    ]);
    expect(reorder([a, b, c], b, null, null, 1)).toEqual([]);
  });

  it('reorder across sections sets the new section on the moved item', () => {
    const milk = item('Milk', { order: 0, sectionId: 'dairy' });
    const s = item('Spinach', { order: 0, sectionId: 'prod' });
    expect(reorder([s], milk, 'prod', 'dairy', 1)).toEqual([{ id: 'milk', order: 1, sectionId: 'prod' }]);
    expect(reorder([], milk, null, 'dairy', 5)).toEqual([{ id: 'milk', order: 0, sectionId: null }]);
  });

  it('moveBy swaps with a neighbour and stops at the ends', () => {
    const a = item('A', { order: 0 });
    const b = item('B', { order: 1 });
    expect(moveBy([a, b], 'b', -1, null)).toEqual([
      { id: 'b', order: 0 },
      { id: 'a', order: 1 },
    ]);
    expect(moveBy([a, b], 'a', -1, null)).toEqual([]);
    expect(moveBy([a, b], 'b', 1, null)).toEqual([]);
  });
});

describe('default grocery list', () => {
  const g1 = list({ id: 'g1', order: 1, isDefaultGrocery: true });
  const g2 = list({ id: 'g2', order: 2 });
  const todo = list({ id: 't', kind: 'todo', order: 0 });

  it('prefers the flagged list, then the first grocery list', () => {
    expect(defaultGroceryList([todo, g2, g1])?.id).toBe('g1');
    expect(defaultGroceryList([todo, g2])?.id).toBe('g2');
    expect(defaultGroceryList([todo])).toBeNull();
  });

  it('hands the flag to another grocery list, never to a to-do or other list', () => {
    expect(nextDefaultGrocery([todo, g1, g2], 'g1')?.id).toBe('g2');
    expect(nextDefaultGrocery([todo, g1], 'g1')).toBeNull();
    expect(nextDefaultGrocery([g1], 'g1')).toBeNull();
  });
});

describe('itemKey', () => {
  it('matches case, plurals, punctuation and notes', () => {
    expect(itemKey('Onions')).toBe(itemKey('onion'));
    expect(itemKey('Tomatoes')).toBe(itemKey('tomato'));
    expect(itemKey('Berries')).toBe(itemKey('berry'));
    expect(itemKey('Basmati rice (aged)')).toBe(itemKey('basmati  RICE'));
    expect(itemKey('Garlic cloves, minced')).toBe(itemKey('garlic clove'));
    expect(itemKey('Glass')).toBe('glass');
    expect(itemKey('Milk')).not.toBe(itemKey('Oat milk'));
  });

  it('gives emoji-only and punctuation-only items their own key, not an empty one', () => {
    expect(itemKey('🍎')).not.toBe(itemKey('🍌'));
    expect(itemKey('🍎')).toBe(itemKey(' 🍎 '));
    expect(itemKey('!!!')).not.toBe('');
    expect(itemKey('🥚 Eggs')).toBe(itemKey('eggs'));
  });

  it('ignores accents and Arabic diacritics without splitting words', () => {
    expect(itemKey('Jalapeño')).toBe(itemKey('jalapeno'));
    expect(itemKey('Crème fraîche')).toBe(itemKey('creme fraiche'));
    expect(itemKey('حَلِيب')).toBe(itemKey('حليب'));
    expect(itemKey('حَلِيب')).not.toContain(' ');
  });

  it('reads Arabic with or without the article, and drops the note after an Arabic comma', () => {
    expect(itemKey('البيض')).toBe(itemKey('بيض'));
    expect(itemKey('الحليب الطازج')).toBe(itemKey('حليب طازج'));
    expect(itemKey('ثوم، مفروم')).toBe(itemKey('ثوم'));
    expect(itemKey('بيض')).not.toBe(itemKey('خبز'));
  });
});

describe('itemWords', () => {
  it('is the words of the name: folded, without notes, punctuation, emoji or the Arabic article', () => {
    expect(itemWords('Crème Fraîche (full fat), 2%')).toEqual(['creme', 'fraiche']);
    expect(itemWords('🥚 Free-range eggs')).toEqual(['free', 'range', 'eggs']);
    expect(itemWords('الحليب الطازج')).toEqual(['حليب', 'طازج']);
    expect(itemWords('الح')).toEqual(['ح']);
    // The article alone is no word yet.
    expect(itemWords('ال')).toEqual([]);
    expect(itemWords('  ')).toEqual([]);
  });
});

describe('itemsByKey', () => {
  it('gives each key its open item and its latest checked-off one', () => {
    const k = itemsByKey([
      item('Onions'),
      item('Oil', { done: true, doneAt: 5 }),
      item('olive', { id: 'a', done: true, doneAt: 5 }),
      item('Oils', { id: 'oil2', done: true, doneAt: 9 }),
      item('البيض'),
    ]);
    expect(k.get(itemKey('onion'))?.open?.text).toBe('Onions');
    expect(k.get(itemKey('oil'))).toEqual({ done: expect.objectContaining({ id: 'oil2' }) });
    expect(k.get(itemKey('بيض'))?.open?.text).toBe('البيض');
  });
});

describe('planMerge', () => {
  const items = [
    item('Pepper', { order: 0 }),
    item('Salt', { order: 1 }),
    item('Kale', { order: 4, sectionId: 'prod' }),
    item('Oil', { order: 7, done: true, doneAt: 1 }),
    item('Leek', { order: 9, done: true, doneAt: 1, sectionId: 'prod' }),
  ];

  it('stacks new rows above the open unsectioned items with distinct orders, and reopens done ones atop their own section', () => {
    const placed = planMerge(list(), items, [{ name: 'Rice' }, { name: 'Oil' }, { name: 'Leek' }, { name: 'Beans' }]);
    expect(placed.map((p) => [p.row.name, p.prior?.id ?? null, p.order])).toEqual([
      ['Rice', null, -3],
      ['Oil', 'oil', -2],
      ['Leek', 'leek', 3],
      ['Beans', null, -1],
    ]);
  });

  it('decides from the list as it is now: what is open there, or repeated, is left out', () => {
    // "Salt" and "Kale" were put on the list (here or on another device) while the ingredients modal was open.
    const placed = planMerge(list(), items, [
      { name: 'Salt', qty: '1 tsp' },
      { name: 'Rice' },
      { name: 'kale' },
      { name: 'rice' },
    ]);
    expect(placed.map((p) => p.row.name)).toEqual(['Rice']);
    expect(planMerge(list(), items, [{ name: 'Salt' }])).toEqual([]);
  });
});

describe('restorable', () => {
  it('puts back only onto lists that exist, and never over an item that has the id now', () => {
    const milk = item('Milk', { id: 'g-milk', done: true, doneAt: 1 });
    const eggs = item('Eggs', { id: 'g-eggs', done: true, doneAt: 1 });
    const tent = item('Tent', { id: 't-tent', listId: 'gone' });
    // "Milk" was added again since (a grocery id is the same for the same list and item).
    expect(restorable([milk, eggs, tent], new Set(['g']), new Set(['g-milk']))).toEqual([eggs]);
  });
});

describe('itemChanges', () => {
  const opened = item('Milk', { sectionId: 'dairy', qty: '1 gal' });
  const order = () => -7;
  it('names only what the editor changed', () => {
    expect(itemChanges(list(), opened, { text: 'Milk ', qty: ' 1 gal', sectionId: 'dairy' }, order)).toEqual({});
    expect(itemChanges(list(), opened, { text: 'Oat milk', qty: '1 gal', sectionId: 'dairy' }, order)).toEqual({
      text: 'Oat milk',
    });
    expect(itemChanges(list(), opened, { text: 'Milk', qty: '', sectionId: 'dairy' }, order)).toEqual({ qty: undefined });
  });
  it('moves the item to the top of a section chosen, and to none', () => {
    expect(itemChanges(list(), opened, { text: 'Milk', qty: '1 gal', sectionId: 'prod' }, order)).toEqual({
      sectionId: 'prod',
      order: -7,
    });
    const out = itemChanges(list(), opened, { text: 'Milk', qty: '1 gal', sectionId: null }, order);
    expect(out).toEqual({ sectionId: undefined, order: -7 });
    expect('sectionId' in out).toBe(true);
  });
  it('compares the section the editor showed: one pointing at a deleted section showed as none', () => {
    const stray = item('Bread', { sectionId: 'gone' });
    expect(itemChanges(list(), stray, { text: 'Bread', qty: '', sectionId: null }, order)).toEqual({});
  });
});

describe('grocery memory', () => {
  const mem = (p: Partial<GroceryMemory> & { text: string }): GroceryMemory => {
    const key = itemKey(p.text);
    return { id: memoryId(key), key, count: 1, lastAt: 0, ...p };
  };

  it('names a document by a hash of its key: always a valid document id', () => {
    for (const text of ['.', '..', '__x__', 'a/b', 'x'.repeat(2000), 'حليب', '🍎']) {
      const id = memoryId(itemKey(text));
      expect(id).toMatch(/^[0-9a-z]+$/);
      expect(id.length).toBeLessThanOrEqual(12);
    }
    expect(memoryId(itemKey('Milk'))).toBe(memoryId(itemKey('milk')));
    expect(memoryId(itemKey('Milk'))).not.toBe(memoryId(itemKey('Eggs')));
  });

  it('starts from what the grocery lists hold: counted, with the latest spelling, leaving out what it has', () => {
    const lists = [list(), list({ id: 't', kind: 'todo' })];
    const items = [
      item('Onions', { createdAt: 5 }),
      item('onion', { id: 'o2', done: true, doneAt: 9 }),
      item('Milk', { createdAt: 1 }),
      item('Call the plumber', { listId: 't' }),
    ];
    const seed = memorySeed(lists, items, new Set([memoryId(itemKey('milk'))]));
    expect(seed).toEqual([{ id: memoryId('onion'), key: 'onion', text: 'onion', count: 2, lastAt: 9 }]);
  });

  it('merges documents an earlier key or id rule wrote into the one their text belongs to', () => {
    const docs = [
      // An encoded id and a key that kept the article.
      { id: encodeURIComponent('البيض'), key: 'البيض', text: 'البيض', count: 3, lastAt: 10 },
      { id: encodeURIComponent('بيض'), key: 'بيض', text: 'بيض', count: 2, lastAt: 20 },
      { id: encodeURIComponent('milk'), key: 'milk', text: 'Milk', count: 4, lastAt: 5 },
      mem({ text: 'Eggs', count: 7 }),
    ];
    const plan = planMemoryTidy(docs);
    expect(plan.write).toEqual([
      { id: memoryId('بيض'), key: 'بيض', text: 'بيض', count: 5, lastAt: 20 },
      { id: memoryId('milk'), key: 'milk', text: 'Milk', count: 4, lastAt: 5 },
    ]);
    expect(plan.remove.sort()).toEqual(
      [encodeURIComponent('البيض'), encodeURIComponent('بيض'), encodeURIComponent('milk')].sort(),
    );
  });

  it('keeps a canonical document and adds what an old one counted', () => {
    const plan = planMemoryTidy([
      mem({ text: 'Milk', count: 2, lastAt: 9 }),
      { id: 'milk', key: 'milk', text: 'milk', count: 1, lastAt: 3 },
    ]);
    expect(plan).toEqual({
      write: [{ id: memoryId('milk'), key: 'milk', text: 'Milk', count: 3, lastAt: 9 }],
      remove: ['milk'],
    });
  });

  it('has nothing to do once tidy, so a second wall running it writes nothing', () => {
    const docs = [mem({ text: 'Milk' }), mem({ text: 'البيض' }), mem({ text: '🍎' })];
    expect(planMemoryTidy(docs)).toEqual({ write: [], remove: [] });
    const once = planMemoryTidy([{ id: 'milk', key: 'milk', text: 'Milk', count: 1, lastAt: 0 }]);
    expect(planMemoryTidy(once.write)).toEqual({ write: [], remove: [] });
  });
});

describe('groceryItemId', () => {
  const fresh = () => 'fresh';
  it('is the same on every device for one list and one item, whatever the spelling', () => {
    const id = groceryItemId('g', 'Milk', [], fresh);
    expect(groceryItemId('g', 'milk', [], fresh)).toBe(id);
    expect(groceryItemId('g', 'Milks', [], fresh)).toBe(id);
    expect(id.startsWith('g-')).toBe(true);
    expect(id).toMatch(/^[A-Za-z0-9-]+$/);
  });
  it('differs between items and between lists', () => {
    expect(groceryItemId('g', 'Milk', [], fresh)).not.toBe(groceryItemId('g', 'Eggs', [], fresh));
    expect(groceryItemId('g', 'Milk', [], fresh)).not.toBe(groceryItemId('h', 'Milk', [], fresh));
    expect(groceryItemId('g', 'حليب', [], fresh)).not.toBe(groceryItemId('g', 'خبز', [], fresh));
    expect(groceryItemId('g', '🍎', [], fresh)).not.toBe(groceryItemId('g', '🍌', [], fresh));
  });
  it('takes a fresh id when an item on the list already has it (renamed since)', () => {
    const id = groceryItemId('g', 'Milk', [], fresh);
    expect(groceryItemId('g', 'Milk', [{ id }], fresh)).toBe('fresh');
  });
});

describe('reopenedChanges', () => {
  it('names only what putting it back changes, so a rename or move made elsewhere is kept', () => {
    expect(reopenedChanges(-4, 'dairy')).toEqual({ done: false, order: -4, sectionId: 'dairy' });
    expect(reopenedChanges(0, null, '2')).toEqual({ done: false, order: 0, sectionId: undefined, qty: '2' });
  });
});

describe('reopenedItem', () => {
  const milk = item('Milk', { sectionId: 'dairy', qty: '1 gal', done: true, doneAt: 5, createdAt: 3 });
  it('is a whole item, so one deleted meanwhile on another device is written back complete', () => {
    expect(reopenedItem(milk, -4, 'dairy')).toEqual({
      id: milk.id,
      listId: 'g',
      text: 'Milk',
      createdAt: 3,
      done: false,
      order: -4,
      sectionId: 'dairy',
      qty: '1 gal',
    });
  });
  it('takes a quantity typed with it, and leaves its section (the field deleted) when added without one', () => {
    const out = reopenedItem(milk, 0, null, '2');
    expect(out.qty).toBe('2');
    expect('sectionId' in out && out.sectionId === undefined).toBe(true);
    expect('qty' in reopenedItem({ ...milk, qty: undefined }, 0, null)).toBe(false);
  });
});
