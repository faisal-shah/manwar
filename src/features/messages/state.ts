import { computed, signal } from '@preact/signals';
import { asParent } from '../../core/lock';
import { data, fieldChanges, newId, patch, put } from '../../data/store';
import type { Message } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { openMessages } from './logic';
import { whenFree } from '../../core/sound';

export const composerOpen = signal(false);

/** Undismissed messages, newest first; the wall shows the first. */
export const pending = computed(() => openMessages(data.messages.value));

/** Writing a message is a parent action. */
export function openComposer(): void {
  void asParent(() => {
    composerOpen.value = true;
  }, 'Enter the PIN to post a message.');
}

export function postMessage(text: string, from: string | undefined, readAloud: boolean): void {
  void put('messages', { id: newId(), text, from, createdAt: currentTime(), readAloud: readAloud || undefined });
}

/** Anyone at the wall can dismiss a message. */
export function dismissMessage(id: string): void {
  void patch('messages', id, { dismissedAt: currentTime() });
}

/** Put a dismissed message back (Undo): it shows again in its place by age. A message deleted meanwhile stays gone. */
export function restoreMessage(id: string): void {
  void patch('messages', id, fieldChanges({ dismissedAt: undefined }) as Partial<Message>);
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Read `text` aloud (after an athan sounding now: core/sound.ts). */
export function speak(text: string): void {
  if (!canSpeak()) return;
  whenFree('speak', () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    speechSynthesis.speak(u);
  });
}
