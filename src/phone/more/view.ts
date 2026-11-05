import { stored } from '../../lib/stored';

/**
 * The More tab's open row (a `MoreItem` id), null for the list. Kept while
 * another tab shows, and for the session (nav.ts). It lives apart from the
 * rows so a row's own module can open another row (People from Stars)
 * without importing the list that imports it; `more/index.tsx` drops an id
 * no row has.
 */
export const moreView = stored<string | null>(
  'manwar.phone.moreView.v1',
  null,
  (v): v is string | null => v === null || typeof v === 'string',
  'session',
);
