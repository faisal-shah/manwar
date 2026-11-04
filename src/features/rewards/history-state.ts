import { signal } from '@preact/signals';

/** Profile whose star history sheet is open. */
export const historyFor = signal<string | null>(null);

export const openHistory = (profileId: string) => {
  historyFor.value = profileId;
};
