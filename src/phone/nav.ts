import type { ComponentType, FunctionComponent } from 'preact';
import { stored } from '../lib/stored';

/** The phone's bottom tabs. */
export type PhoneTab = 'today' | 'tasks' | 'lists' | 'calendar' | 'more';
const TABS: readonly unknown[] = ['today', 'tasks', 'lists', 'calendar', 'more'] satisfies PhoneTab[];

/**
 * The tab shown. It and each tab's inner view (the open list, More's view,
 * To assign) are kept for the browser tab's session, so the update reload
 * (after two idle minutes) or a phone bringing back a tab it put away
 * opens where the parent was; overlays are not kept.
 */
export const phoneTab = stored<PhoneTab>('manwar.phone.tab.v1', 'today', (v): v is PhoneTab => TABS.includes(v), 'session');

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
   * arrow (and a tap on the tab while on it) does; null at the tab's top.
   * (The view itself holds the phone's Back gesture with useBack.)
   */
  back?: () => (() => void) | null;
  Body: FunctionComponent;
  /** A count on the tab (events to assign). */
  badge?: () => number;
}
