import { describe, expect, it } from 'vitest';
import type { GroceryMemory } from '../../src/data/types';
import { itemWords as words } from '../../src/features/lists/logic';
import { matchScore, startsWithTyped, suggest, typedItem } from '../../src/features/lists/suggest';

const NOW = Date.UTC(2026, 10, 5);
const DAY = 86_400_000;
const m = (text: string, count = 1, daysAgo = 10): GroceryMemory => ({
  id: text,
  key: text,
  text,
  count,
  lastAt: NOW - daysAgo * DAY,
});
/** What the Add item field suggests for `field`, as ListCard asks: by the name typed, without its quantity. */
const texts = (field: string, memory: GroceryMemory[]) => suggest(typedItem(field).name, memory, NOW).map((s) => s.memory.text);

describe('grocery suggestions', () => {
  it('matches a word by its start, the same word in the plural, and from four letters a slip', () => {
    expect(matchScore(['fil'], words('fish fillet frozen'))).toBeGreaterThan(0);
    expect(matchScore(['fillet'], words('frozen fish fillets'))).toBeGreaterThan(0);
    expect(matchScore(['tomatoes'], words('tomato'))).toBe(1);
    expect(matchScore(['banan'], words('bananas'))).toBeGreaterThan(0);
    expect(matchScore(['bannana'], words('banana'))).toBeGreaterThan(0);
    expect(matchScore(['mlk'], words('milk'))).toBe(0);
    expect(matchScore(['xyz'], words('milk'))).toBe(0);
  });

  it('needs every word typed to match', () => {
    expect(matchScore(['fish', 'fil'], words('breaded fish fillets'))).toBeGreaterThan(0);
    expect(matchScore(['fish', 'fil'], words('filter jug'))).toBe(0);
  });

  it('suggests nothing for nothing typed', () => {
    expect(suggest('', [m('milk')], NOW)).toEqual([]);
    expect(suggest('   ', [m('milk')], NOW)).toEqual([]);
  });

  it('puts the items whose words start with what is typed first, the closest first', () => {
    const memory = [
      m('hanging file folders'),
      m('wild caught fish fillet, cod or salmon'),
      m('frozen fish fillets'),
      m('filter jug'),
      m('fish fillet frozen'),
      m('profile picture frame'),
    ];
    // First the item that starts with it, then by how few other words each has; "profile" holds "fil"
    // only in its middle: last.
    expect(texts('fil', memory)).toEqual([
      'filter jug',
      'hanging file folders',
      'fish fillet frozen',
      'frozen fish fillets',
      'wild caught fish fillet, cod or salmon',
      'profile picture frame',
    ]);
    expect(texts('fish fil', memory)).toEqual([
      'fish fillet frozen',
      'frozen fish fillets',
      'wild caught fish fillet, cod or salmon',
    ]);
  });

  it('puts an item whose name starts with what is typed above one matched by a later word, however often that is bought', () => {
    const memory = [m('chicken breast', 40, 1), m('brown sugar', 1, 300), m('bread', 3, 20)];
    expect(texts('b', memory)).toEqual(['bread', 'brown sugar', 'chicken breast']);
    expect(startsWithTyped(['b'], words('brown sugar'))).toBe(true);
    expect(startsWithTyped(['b'], words('chicken breast'))).toBe(false);
  });

  it('among items that match about as well, puts the ones added often and lately first', () => {
    const memory = [m('milk powder', 1, 300), m('milk', 12, 3), m('milk chocolate', 2, 40)];
    expect(texts('mil', memory)[0]).toBe('milk');
    const usual = [m('eggs, large', 1, 200), m('eggs', 1, 200), m('eggplant', 9, 2)];
    expect(texts('egg', usual)[0]).toBe('eggplant');
  });

  it('suggests by the name typed after a quantity, as the item is added', () => {
    const memory = [m('2% milk'), m('Milk'), m('Eggs'), m('Olive oil')];
    expect(typedItem('2 gal milk')).toEqual({ name: 'Milk', qty: '2 gal' });
    expect(typedItem('1 dozen eggs')).toEqual({ name: 'Eggs', qty: '1 dozen' });
    expect(typedItem('2% milk')).toEqual({ name: '2% milk' });
    expect(texts('2 milk', memory)).toEqual(['Milk', '2% milk']);
    expect(texts('1 dozen eggs', memory)).toEqual(['Eggs']);
    expect(texts('2 gal mil', memory)).toEqual(['Milk', '2% milk']);
    // "2" alone may be the start of "2% milk".
    expect(texts('2', memory)).toEqual(['2% milk']);
  });

  it('finds Arabic items with or without the article and diacritics, the article alone asking nothing yet', () => {
    const memory = [m('الحليب'), m('خبز'), m('حَلْوَى'), m('البيض')];
    expect(texts('حليب', memory)).toEqual(['الحليب']);
    expect(texts('حلو', memory)).toEqual(['حَلْوَى']);
    expect(texts('الح', memory)).toEqual(['الحليب', 'حَلْوَى']);
    expect(texts('الب', memory)).toEqual(['البيض']);
    expect(texts('ال', memory)).toEqual([]);
  });

  it('shows at most eight', () => {
    const memory = Array.from({ length: 20 }, (_, i) => m(`apple ${i}`));
    expect(suggest('app', memory, NOW)).toHaveLength(8);
  });
});
