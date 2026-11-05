import { describe, expect, it } from 'vitest';
import type { List, ListItem } from '../../src/data/types';
import {
  defaultGroceryList,
  groupItems,
  itemKey,
  moveBy,
  nextDefaultGrocery,
  placeMerge,
  reorder,
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
});

describe('placeMerge', () => {
  it('stacks new rows above the open unsectioned items with distinct orders, and reopens done ones atop their own section', () => {
    const items = [
      item('Pepper', { order: 0 }),
      item('Salt', { order: 1 }),
      item('Kale', { order: 4, sectionId: 'prod' }),
      item('Oil', { order: 7, done: true, doneAt: 1 }),
      item('Leek', { order: 9, done: true, doneAt: 1, sectionId: 'prod' }),
    ];
    const placed = placeMerge(list(), items, [
      { name: 'Rice' },
      { name: 'Oil', reopenId: 'oil' },
      { name: 'Leek', reopenId: 'leek' },
      { name: 'Beans' },
      { name: 'Gone', reopenId: 'deleted-meanwhile' },
    ]);
    expect(placed.map((p) => [p.row.name, p.prior?.id ?? null, p.order])).toEqual([
      ['Rice', null, -4],
      ['Oil', 'oil', -3],
      ['Leek', 'leek', 3],
      ['Beans', null, -2],
      ['Gone', null, -1],
    ]);
  });
});
