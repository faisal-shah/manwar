import { describe, expect, it } from 'vitest';
import { chooseLayout } from '../../src/app/layout';
import { formatPairCode } from '../../src/phone/pairCode';

describe('layout', () => {
  it("takes the address first, then this device's choice, then the screen", () => {
    expect(chooseLayout('phone', 'wall', false, 1280)).toBe('phone');
    expect(chooseLayout('wall', 'phone', false, 390)).toBe('wall');
    expect(chooseLayout(null, 'phone', false, 1280)).toBe('phone');
    expect(chooseLayout(null, 'wall', false, 390)).toBe('wall');
    expect(chooseLayout(null, null, false, 412)).toBe('phone');
    expect(chooseLayout(null, null, false, 800)).toBe('wall');
    expect(chooseLayout(null, null, false, 600)).toBe('wall');
  });
  it('keeps a device already signed in as the wall a wall, whatever its screen (a small tablet, a larger display size)', () => {
    expect(chooseLayout(null, null, true, 533)).toBe('wall');
    // A choice made on the device, or the address, still wins.
    expect(chooseLayout(null, 'phone', true, 533)).toBe('phone');
    expect(chooseLayout('phone', null, true, 533)).toBe('phone');
  });
  it('ignores values it does not know', () => {
    expect(chooseLayout('tablet', 'kiosk', false, 390)).toBe('phone');
    expect(chooseLayout('', '', false, 1000)).toBe('wall');
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
