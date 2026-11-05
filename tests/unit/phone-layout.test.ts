import { describe, expect, it } from 'vitest';
import { chooseLayout } from '../../src/app/layout';
import { formatPairCode } from '../../src/phone/pairCode';

describe('layout', () => {
  it("takes the address first, then this device's choice, then the screen", () => {
    expect(chooseLayout('phone', 'wall', 1280)).toBe('phone');
    expect(chooseLayout('wall', 'phone', 390)).toBe('wall');
    expect(chooseLayout(null, 'phone', 1280)).toBe('phone');
    expect(chooseLayout(null, 'wall', 390)).toBe('wall');
    expect(chooseLayout(null, null, 412)).toBe('phone');
    expect(chooseLayout(null, null, 800)).toBe('wall');
    expect(chooseLayout(null, null, 600)).toBe('wall');
  });
  it('ignores values it does not know', () => {
    expect(chooseLayout('tablet', 'kiosk', 390)).toBe('phone');
    expect(chooseLayout('', '', 1000)).toBe('wall');
  });
});

describe('pairing code input', () => {
  it('shows the code as two groups of four, whatever was typed', () => {
    expect(formatPairCode('abcd')).toBe('ABCD');
    expect(formatPairCode('abcde')).toBe('ABCD-E');
    expect(formatPairCode('ab cd-ef gh')).toBe('ABCD-EFGH');
    expect(formatPairCode('ABCD-EFGHJK')).toBe('ABCD-EFGH');
    expect(formatPairCode('')).toBe('');
  });
});
