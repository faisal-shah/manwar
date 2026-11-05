import { describe, expect, it } from 'vitest';
import { h } from 'preact';
import { installAutoDirection } from '../../src/ui/bidi';

/** Text fields follow the direction of their text; other inputs and elements are left alone. */
describe('text field direction', () => {
  installAutoDirection();
  const dir = (type: string, props: Record<string, unknown> = {}) => (h(type, props).props as { dir?: string }).dir;

  it('gives text inputs and textareas dir="auto"', () => {
    expect(dir('input')).toBe('auto');
    expect(dir('input', { type: 'text' })).toBe('auto');
    expect(dir('input', { type: 'search' })).toBe('auto');
    expect(dir('textarea')).toBe('auto');
  });

  it('leaves other inputs, other elements and an explicit direction alone', () => {
    for (const type of ['time', 'date', 'checkbox', 'range', 'number']) expect(dir('input', { type })).toBeUndefined();
    expect(dir('div')).toBeUndefined();
    expect(dir('button')).toBeUndefined();
    expect(dir('input', { dir: 'ltr' })).toBe('ltr');
  });
});
