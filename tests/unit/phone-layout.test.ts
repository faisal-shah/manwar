import { describe, expect, it } from 'vitest';
import { chooseLayout, type LayoutSignals } from '../../src/app/layout';
import { formatPairCode } from '../../src/phone/pairCode';

describe('layout', () => {
  const pick = (over: Partial<LayoutSignals>) =>
    chooseLayout({ param: null, chosen: null, openedAs: null, fully: false, shortSide: 1000, ...over });
  it("takes the address first, then this device's choice", () => {
    expect(pick({ param: 'phone', chosen: 'wall', shortSide: 1280 })).toBe('phone');
    expect(pick({ param: 'wall', chosen: 'phone', shortSide: 390, openedAs: 'paired' })).toBe('wall');
    expect(pick({ chosen: 'phone', shortSide: 1280, fully: true })).toBe('phone');
    expect(pick({ chosen: 'wall', shortSide: 390, openedAs: 'paired' })).toBe('wall');
  });
  it('makes a paired phone a phone, and Fully Kiosk a wall', () => {
    expect(pick({ openedAs: 'paired', shortSide: 800 })).toBe('phone');
    expect(pick({ fully: true, shortSide: 400 })).toBe('wall');
    expect(pick({ fully: true, openedAs: 'paired', shortSide: 400 })).toBe('phone');
  });
  it('otherwise goes by the screen', () => {
    expect(pick({ shortSide: 412 })).toBe('phone');
    expect(pick({ shortSide: 533 })).toBe('phone');
    expect(pick({ shortSide: 600 })).toBe('wall');
    expect(pick({ shortSide: 800 })).toBe('wall');
  });
  it('keeps a small tablet that opened the household as the wall a wall, but never a phone-sized screen', () => {
    expect(pick({ openedAs: 'wall', shortSide: 533 })).toBe('wall');
    expect(pick({ openedAs: 'wall', shortSide: 480 })).toBe('wall');
    // A phone once signed in with the household's Google account is still a phone.
    expect(pick({ openedAs: 'wall', shortSide: 479 })).toBe('phone');
    expect(pick({ openedAs: 'wall', shortSide: 412 })).toBe('phone');
    expect(pick({ openedAs: 'wall', shortSide: 412, chosen: 'wall' })).toBe('wall');
  });
  it('ignores values it does not know', () => {
    expect(pick({ param: 'tablet', chosen: 'kiosk', shortSide: 390 })).toBe('phone');
    expect(pick({ param: '', chosen: '' })).toBe('wall');
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
