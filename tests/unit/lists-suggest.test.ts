import { describe, expect, it } from 'vitest';
import type { GroceryMemory } from '../../src/data/types';
import { matchScore, suggest, words } from '../../src/features/lists/suggest';

const NOW = Date.UTC(2026, 10, 5);
const DAY = 86_400_000;
const m = (text: string, count = 1, daysAgo = 10): GroceryMemory => ({
  id: text,
  key: text,
  text,
  count,
  lastAt: NOW - daysAgo * DAY,
});
const texts = (typed: string, memory: GroceryMemory[]) => suggest(typed, memory, NOW).map((s) => s.memory.text);

describe('grocery suggestions', () => {
  it('reads words without case, accents, punctuation or the Arabic article', () => {
    expect(words('Crème Fraîche, 2%')).toEqual(['creme', 'fraiche', '2']);
    expect(words('الحليب الطازج')).toEqual(['حليب', 'طازج']);
    expect(words('  ')).toEqual([]);
  });

  it('matches a word by its start, the same word in the plural, and from four letters a slip', () => {
    expect(matchScore(['fil'], words('fish fillet frozen'))).toBeGreaterThan(0);
    expect(matchScore(['fillet'], words('frozen fish fillets'))).toBeGreaterThan(0);
    expect(matchScore(['tomatoes'], words('tomato'))).toBe(1.15);
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
      m('wild caught fish fillet - cod, salmon'),
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
      'wild caught fish fillet - cod, salmon',
      'profile picture frame',
    ]);
    expect(texts('fish fil', memory)).toEqual([
      'fish fillet frozen',
      'frozen fish fillets',
      'wild caught fish fillet - cod, salmon',
    ]);
  });

  it('among items that match as well, puts the ones added often and lately first', () => {
    const memory = [m('milk powder', 1, 300), m('milk', 12, 3), m('milk chocolate', 2, 40)];
    expect(texts('mil', memory)[0]).toBe('milk');
    const usual = [m('eggs, large', 1, 200), m('eggs', 1, 200), m('eggplant', 9, 2)];
    expect(texts('egg', usual)[0]).toBe('eggplant');
  });

  it('finds Arabic items with or without the article and diacritics', () => {
    const memory = [m('الحليب'), m('خبز'), m('حَلْوَى')];
    expect(texts('حليب', memory)).toEqual(['الحليب']);
    expect(texts('حلو', memory)).toEqual(['حَلْوَى']);
  });

  it('shows at most eight', () => {
    const memory = Array.from({ length: 20 }, (_, i) => m(`apple ${i}`));
    expect(suggest('app', memory, NOW)).toHaveLength(8);
  });
});
