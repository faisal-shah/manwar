import type { Message } from '../../data/types';

/** Skylight's limit for a typed message. */
export const MAX_MESSAGE_LENGTH = 220;

/** Undismissed messages, newest first. */
export function openMessages(messages: Message[]): Message[] {
  return messages.filter((m) => !m.dismissedAt).sort((a, b) => b.createdAt - a.createdAt);
}

/** "just now", "5 min ago", "2 hr ago", "yesterday", "3 days ago". */
export function timeAgo(at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Message text size steps down as the text gets longer, so a note always fits. */
export function messageSize(text: string): 'xl' | 'lg' | 'md' {
  if (text.length <= 60) return 'xl';
  if (text.length <= 140) return 'lg';
  return 'md';
}
