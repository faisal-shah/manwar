import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../src/data/types';
import { displayUrl, ingredientLines, instructionSteps, searchRecipes, sourceUrlError } from '../../src/features/recipes/text';

describe('instructionSteps', () => {
  it('splits a paragraph at sentence ends', () => {
    expect(instructionSteps('Brown the beef. Add sauce and simmer 15 minutes. Serve!')).toEqual([
      'Brown the beef.',
      'Add sauce and simmer 15 minutes.',
      'Serve!',
    ]);
  });
  it('keeps decimals and lowercase continuations inside a sentence', () => {
    expect(instructionSteps('Add 1.5 cups milk, e.g. whole milk. Stir.')).toEqual([
      'Add 1.5 cups milk, e.g. whole milk.',
      'Stir.',
    ]);
  });
  it('takes lines as steps and drops their numbering', () => {
    expect(instructionSteps('Instructions:\n1. Melt the butter.\n2) Add onion. Stir well.\nStep 3: Serve')).toEqual([
      'Melt the butter.',
      'Add onion. Stir well.',
      'Serve',
    ]);
  });
  it('is empty for blank text', () => {
    expect(instructionSteps('  \n ')).toEqual([]);
  });
});

describe('recipe text helpers', () => {
  it('splits ingredients one per line', () => {
    expect(ingredientLines(' 2 eggs \n\nMilk\n')).toEqual(['2 eggs', 'Milk']);
  });
  it('validates source URLs', () => {
    expect(sourceUrlError('')).toBeNull();
    expect(sourceUrlError('https://example.com/r/1')).toBeNull();
    expect(sourceUrlError('example.com')).not.toBeNull();
    expect(sourceUrlError('javascript:alert(1)')).not.toBeNull();
    expect(displayUrl('https://www.example.com/recipes/biryani/')).toBe('www.example.com/recipes/biryani');
  });
  it('searches names first, then ingredients', () => {
    const r = (name: string, ingredients: string[]): Recipe => ({
      id: name,
      name,
      category: 'dinner',
      ingredients,
      instructions: '',
      createdAt: 0,
    });
    const all = [r('Spaghetti', ['1 onion']), r('Onion soup', ['Onions']), r('Toast', ['Bread'])];
    expect(searchRecipes(all, 'onion').map((x) => x.name)).toEqual(['Onion soup', 'Spaghetti']);
    expect(searchRecipes(all, '').map((x) => x.name)).toEqual(['Onion soup', 'Spaghetti', 'Toast']);
  });
});
