import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  pressKey,
  splitRemaining,
  timerStage,
  validMinutes,
  type KeypadKey,
} from '../../src/features/timer/logic';

const type = (...keys: KeypadKey[]) => keys.reduce(pressKey, '');

describe('timer keypad', () => {
  it('appends up to three digits', () => {
    expect(type('1', '5')).toBe('15');
    expect(type('9', '9', '9', '9')).toBe('999');
  });
  it('ignores a leading zero', () => {
    expect(type('0', '0', '5')).toBe('5');
    expect(type('1', '0')).toBe('10');
  });
  it('backspaces and clears', () => {
    expect(type('1', '2', 'back')).toBe('1');
    expect(type('back')).toBe('');
    expect(type('1', '2', '3', 'clear')).toBe('');
  });
  it('accepts 1 to 999 minutes', () => {
    expect(validMinutes(0)).toBe(false);
    expect(validMinutes(1)).toBe(true);
    expect(validMinutes(999)).toBe(true);
    expect(validMinutes(1000)).toBe(false);
    expect(validMinutes(1.5)).toBe(false);
  });
});

describe('timer display', () => {
  it('rounds the remaining time up to the second', () => {
    expect(splitRemaining(15 * 60_000)).toEqual({ mins: 15, secs: 0 });
    expect(splitRemaining(14 * 60_000 + 1_500)).toEqual({ mins: 14, secs: 2 });
    expect(splitRemaining(1)).toEqual({ mins: 0, secs: 1 });
    expect(splitRemaining(-50)).toEqual({ mins: 0, secs: 0 });
  });
  it('formats the original duration', () => {
    expect(formatDuration(15)).toBe('15 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(125)).toBe('2 hr 5 min');
  });
  it('shifts blue, green, orange, red as time runs down', () => {
    expect([1, 0.6, 0.5, 0.3, 0.25, 0.15, 0.1, 0].map(timerStage)).toEqual([
      'blue',
      'blue',
      'green',
      'green',
      'orange',
      'orange',
      'red',
      'red',
    ]);
  });
});
