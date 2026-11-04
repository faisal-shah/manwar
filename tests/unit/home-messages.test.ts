import { describe, expect, it } from 'vitest';
import type { Message } from '../../src/data/types';
import { messageSize, openMessages, timeAgo } from '../../src/features/messages/logic';

const msg = (id: string, createdAt: number, dismissedAt?: number): Message => ({ id, text: id, createdAt, dismissedAt });

describe('messages', () => {
  it('shows undismissed messages newest first', () => {
    const list = [msg('a', 1), msg('b', 3, 4), msg('c', 2), msg('d', 5)];
    expect(openMessages(list).map((m) => m.id)).toEqual(['d', 'c', 'a']);
    expect(openMessages([msg('x', 1, 2)])).toEqual([]);
  });
  it('says how long ago a message was posted', () => {
    const now = 1_000_000_000_000;
    const min = 60_000;
    expect(timeAgo(now - 20_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * min, now)).toBe('5 min ago');
    expect(timeAgo(now - 59 * min, now)).toBe('59 min ago');
    expect(timeAgo(now - 60 * min, now)).toBe('1 hr ago');
    expect(timeAgo(now - 25 * 60 * min, now)).toBe('yesterday');
    expect(timeAgo(now - 3 * 24 * 60 * min, now)).toBe('3 days ago');
  });
  it('steps the note text down as messages get longer', () => {
    expect(messageSize('Dinner at 7!')).toBe('xl');
    expect(messageSize('x'.repeat(100))).toBe('lg');
    expect(messageSize('x'.repeat(220))).toBe('md');
  });
});
