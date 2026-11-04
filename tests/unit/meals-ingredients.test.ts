import { describe, expect, it } from 'vitest';
import type { ListItem } from '../../src/data/types';
import { classifyIngredients, parseIngredient } from '../../src/features/meals/ingredients';

describe('parseIngredient', () => {
  const cases: [string, string | undefined, string][] = [
    ['2 lb chicken thighs', '2 lb', 'Chicken thighs'],
    ['3 cups basmati rice', '3 cups', 'Basmati rice'],
    ['2 onions', '2', 'Onions'],
    ['1 jar marinara', '1 jar', 'Marinara'],
    ['1/2 teaspoon dried thyme', '1/2 teaspoon', 'Dried thyme'],
    ['1 1/2 cups milk', '1 1/2 cups', 'Milk'],
    ['1.5 cups milk', '1.5 cups', 'Milk'],
    ['½ cup sugar', '½ cup', 'Sugar'],
    ['2-3 cloves garlic', '2-3 cloves', 'Garlic'],
    ['200g flour', '200 g', 'Flour'],
    ['12 oz. pasta', '12 oz', 'Pasta'],
    ['2 large eggs', '2', 'Large eggs'],
    ['4 cups of stock', '4 cups', 'Stock'],
    ['Pinch of salt', 'Pinch', 'Salt'],
    ['Fresh mint and cilantro', undefined, 'Fresh mint and cilantro'],
    ['- Cream cheese', undefined, 'Cream cheese'],
    ['• 8 slices cheddar', '8 slices', 'Cheddar'],
  ];
  for (const [line, qty, name] of cases)
    it(line, () => {
      const p = parseIngredient(line)!;
      expect([p.qty, p.name]).toEqual([qty, name]);
    });

  it('skips blank lines and headers', () => {
    expect(parseIngredient('  ')).toBeNull();
    expect(parseIngredient('Ingredients:')).toBeNull();
  });
});

describe('classifyIngredients', () => {
  const it_ = (id: string, text: string, done = false, doneAt?: number): ListItem => ({
    id,
    listId: 'g',
    text,
    done,
    doneAt,
    order: 0,
    createdAt: 0,
  });
  const grocery = [
    it_('onions', 'Onions'),
    it_('rice', 'Basmati rice'),
    it_('oil', 'Olive oil', true, 5),
    it_('oil2', 'olive oil', true, 9),
  ];

  it('marks open items as on the list, checked-off ones to reopen, the rest new', () => {
    const rows = classifyIngredients(['2 onions', '3 cups basmati rice', '2 tbsp olive oil', '1 cup yogurt'], grocery);
    expect(rows.map((r) => [r.name, r.status, r.itemId])).toEqual([
      ['Onions', 'onList', 'onions'],
      ['Basmati rice', 'onList', 'rice'],
      ['Olive oil', 'reopen', 'oil2'],
      ['Yogurt', 'new', undefined],
    ]);
  });

  it('collapses repeated ingredients and skips headers', () => {
    const rows = classifyIngredients(['Ingredients:', '1 onion', '2 onions, sliced', 'Salt'], []);
    expect(rows.map((r) => r.name)).toEqual(['Onion', 'Salt']);
  });
});
