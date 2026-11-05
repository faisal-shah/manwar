import type { List, ListItem } from '../../data/types';
import { groupItems } from '../../features/lists/logic';
import { isolate } from '../../lib/text';

export interface ListSummary {
  /** The first open items in list order (sections as the list shows them). */
  first: string[];
  /** Open items after those. */
  more: number;
  open: number;
  done: number;
}

/** What a list's row on the phone says about it: its first few open items and the counts. */
export function listSummary(list: List, items: ListItem[], max = 3): ListSummary {
  const view = groupItems(list, items);
  const open = view.groups.flatMap((g) => g.items);
  return {
    first: open.slice(0, max).map((i) => i.text),
    more: Math.max(0, open.length - max),
    open: open.length,
    done: view.done.length,
  };
}

/** The row's second line: "Bananas, Spinach, Onions +4", "All 3 done", "Nothing on it yet". */
export function summaryLine(s: ListSummary): string {
  if (s.open) return s.first.map(isolate).join(', ') + (s.more ? ` +${s.more}` : '');
  return s.done ? `All ${s.done} done` : 'Nothing on it yet';
}
