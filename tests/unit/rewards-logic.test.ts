import { describe, expect, it } from 'vitest';
import type { LedgerEntry, Reward } from '../../src/data/types';
import { formatStars, relativeTime, rewardsFor, undoable, validateCost } from '../../src/features/rewards/logic';

const reward = (p: Partial<Reward>): Reward => ({
  id: p.title ?? 'r',
  title: 'R',
  cost: 50,
  profiles: [],
  renews: true,
  redeemedBy: {},
  order: 0,
  createdAt: 0,
  ...p,
});

describe('formatStars', () => {
  it('abbreviates like the device and never rounds up', () => {
    expect(formatStars(0)).toBe('0');
    expect(formatStars(999)).toBe('999');
    expect(formatStars(1000)).toBe('1K');
    expect(formatStars(1250)).toBe('1.2K');
    expect(formatStars(28_560)).toBe('28.5K');
    expect(formatStars(99_999)).toBe('99.9K');
    expect(formatStars(128_400)).toBe('128K');
    expect(formatStars(1_250_000)).toBe('1.2M');
    expect(formatStars(-1500)).toBe('-1.5K');
  });
});

describe('validateCost', () => {
  it('accepts whole numbers from 1 to 10000', () => {
    expect(validateCost(1)).toBeNull();
    expect(validateCost(10_000)).toBeNull();
    expect(validateCost(0)).toMatch(/between 1 and 10,000/);
    expect(validateCost(10_001)).toMatch(/between/);
    expect(validateCost(2.5)).toMatch(/whole number/);
    expect(validateCost(NaN)).toMatch(/whole number/);
  });
});

describe('rewardsFor', () => {
  const all = [
    reward({ title: 'Everyone', cost: 30, order: 2 }),
    reward({ title: 'Kids only', profiles: ['kid'], order: 1 }),
    reward({ title: 'Once', renews: false, redeemedBy: { kid: 123 }, order: 0 }),
    reward({ title: 'Gone', archived: true }),
  ];
  it('shows eligible rewards with progress, redeemed ones last', () => {
    const kid = rewardsFor(all, 'kid', 40, false);
    expect(kid.map((v) => [v.reward.title, v.affordable, v.redeemedAt ?? null])).toEqual([
      ['Kids only', false, null],
      ['Everyone', true, null],
      ['Once', false, 123],
    ]);
    expect(kid[0].progress).toBeCloseTo(0.8);
    expect(kid[1].progress).toBe(1);
  });
  it('hides rewards for other profiles and, on request, redeemed ones', () => {
    expect(rewardsFor(all, 'mom', 0, false).map((v) => v.reward.title)).toEqual(['Once', 'Everyone']);
    expect(rewardsFor(all, 'kid', 0, true).map((v) => v.reward.title)).toEqual(['Kids only', 'Everyone']);
  });
});

describe('ledger helpers', () => {
  const e = (p: Partial<LedgerEntry>): LedgerEntry => ({
    id: 'e',
    profileId: 'a',
    delta: 1,
    reason: 'task',
    label: 'L',
    at: 0,
    ...p,
  });
  it('offers undo only on original entries that are not undone', () => {
    expect(undoable(e({}))).toBe(true);
    expect(undoable(e({ reason: 'redeem', delta: -5 }))).toBe(true);
    expect(undoable(e({ undoneAt: 5 }))).toBe(false);
    expect(['untask', 'unredeem', 'undo'].map((reason) => undoable(e({ reason: reason as LedgerEntry['reason'] })))).toEqual([
      false,
      false,
      false,
    ]);
  });
  it('describes times relative to now', () => {
    const now = new Date('2026-11-04T11:44:00').getTime();
    const ago = (ms: number) => relativeTime(now - ms, now);
    expect(ago(20_000)).toBe('Just now');
    expect(ago(5 * 60_000)).toBe('5 min ago');
    expect(ago(3 * 3_600_000)).toBe('3 h ago');
    expect(relativeTime(new Date('2026-11-03T20:00:00').getTime(), now)).toBe('Yesterday');
    expect(relativeTime(new Date('2026-11-01T09:00:00').getTime(), now)).toBe('Sun');
    expect(relativeTime(new Date('2026-10-12T09:00:00').getTime(), now)).toBe('Oct 12');
    expect(relativeTime(new Date('2025-10-12T09:00:00').getTime(), now)).toBe('Oct 12, 2025');
  });
});
