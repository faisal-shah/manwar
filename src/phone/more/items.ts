import type { ComponentType, FunctionComponent } from 'preact';

/**
 * A row on the phone's More tab that opens a view (stars and rewards, a
 * note to the wall, the wall timer, ...). Features add theirs to
 * MORE_ITEMS in `more/index.tsx`.
 */
export interface MoreItem {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number }>;
  /** A line under the label (what is running, how many). */
  hint?: () => string | null;
  View: FunctionComponent;
}
