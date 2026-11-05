import { signal } from '@preact/signals';
import type { ComponentType, FunctionComponent } from 'preact';

/** The phone's bottom tabs. */
export type PhoneTab = 'today' | 'tasks' | 'lists' | 'calendar' | 'more';

export const phoneTab = signal<PhoneTab>('today');

export function goPhone(tab: PhoneTab): void {
  phoneTab.value = tab;
}

/**
 * A bottom tab of the phone. Each lives in `src/phone/<id>/` and is listed in
 * `pages.ts`; the shell draws the header (title and the optional `Action`
 * at its right), the body and the tab bar from it.
 */
export interface PhonePage {
  id: PhoneTab;
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number }>;
  /** Header title; the label when omitted. */
  title?: () => string;
  /** Right side of the header (an Add button). */
  Action?: FunctionComponent;
  /**
   * While the tab shows one of its inner views, what the header's back
   * arrow does; null at the tab's top. (The view itself holds the phone's
   * Back gesture with useBack.)
   */
  back?: () => (() => void) | null;
  Body: FunctionComponent;
  /** A count on the tab (events to assign). */
  badge?: () => number;
}
