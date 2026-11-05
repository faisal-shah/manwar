import { describe, expect, it } from 'vitest';
import type { Recipe } from '../../src/data/types';
import {
  displayUrl,
  ingredientLines,
  ingredientRows,
  instructionSteps,
  searchRecipes,
  sourceUrlError,
} from '../../src/features/recipes/text';

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
  it('drops pasted bullets from step lines', () => {
    expect(instructionSteps('- Melt the butter.\n• Add the onion.')).toEqual(['Melt the butter.', 'Add the onion.']);
  });
  it('is empty for blank text', () => {
    expect(instructionSteps('  \n ')).toEqual([]);
  });
});

describe('recipe text helpers', () => {
  it('splits ingredients one per line', () => {
    expect(ingredientLines(' 2 eggs \n\nMilk\n')).toEqual(['2 eggs', 'Milk']);
  });
  it('shows stored lines without markers, with group headings', () => {
    expect(ingredientRows(['Ingredients:', '- 2 cups flour', '', 'For the sauce:', '1. 1 cup milk'])).toEqual([
      { text: '2 cups flour', heading: false },
      { text: 'For the sauce', heading: true },
      { text: '1 cup milk', heading: false },
    ]);
  });
  it('drops pasted bullets and list numbers but keeps quantities', () => {
    expect(ingredientLines('- 2 cups flour\n• Salt\n1. 3 eggs\n2) 1.5 cups milk\n-\n1.5 kg lamb')).toEqual([
      '2 cups flour',
      'Salt',
      '3 eggs',
      '1.5 cups milk',
      '1.5 kg lamb',
    ]);
  });
  it('validates source URLs', () => {
    expect(sourceUrlError('')).toBeNull();
    expect(sourceUrlError('https://example.com/r/1')).toBeNull();
    expect(sourceUrlError('example.com')).not.toBeNull();
    expect(sourceUrlError('javascript:alert(1)')).not.toBeNull();
    expect(displayUrl('https://www.example.com/recipes/biryani/')).toBe('www.example.com/recipes/biryani');
    expect(displayUrl('https://ar.wikipedia.org/wiki/كبسة')).toBe('ar.wikipedia.org/wiki/كبسة');
    expect(displayUrl('https://example.com/my recipe')).toBe('example.com/my recipe');
    expect(displayUrl('https://example.com/100%25-juice')).toBe('example.com/100%-juice');
    expect(displayUrl('https://example.com/bad%E0%A4%A')).toBe('example.com/bad%E0%A4%A');
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
  it('searches across Arabic diacritics and Latin accents', () => {
    const r = (name: string): Recipe => ({ id: name, name, category: 'dinner', ingredients: [], instructions: '', createdAt: 0 });
    const all = [r('كَبْسَة لحم'), r('كبسة دجاج'), r('Crème brûlée'), r('Toast')];
    expect(searchRecipes(all, 'كبسة').map((x) => x.name)).toEqual(['كبسة دجاج', 'كَبْسَة لحم']);
    expect(searchRecipes(all, 'كَبْسَة').map((x) => x.name)).toEqual(['كبسة دجاج', 'كَبْسَة لحم']);
    expect(searchRecipes(all, 'creme BRULEE').map((x) => x.name)).toEqual(['Crème brûlée']);
  });
});
