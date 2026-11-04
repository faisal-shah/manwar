import type { ComponentType, FunctionComponent } from 'preact';
import type { TabId } from '../data/types';

/**
 * A nav-rail tab. Each feature module exports one; the shell renders the
 * rail item, the top-bar controls, the body and the + button from it.
 */
export interface TabDef {
  id: TabId;
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number }>;
  /** Right side of the top bar (view switcher, filter, paging). */
  Controls?: FunctionComponent;
  /** The tab's content area (below the top bar). */
  Body: FunctionComponent;
  /** The blue + button. Omit to hide it on this tab. */
  onAdd?: () => void;
  /** Replaces the date in the top bar, e.g. "April 2026" when paged away from today. */
  title?: () => string | null;
}
