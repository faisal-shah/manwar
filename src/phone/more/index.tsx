import { ChevronRight, Ellipsis, Smartphone } from 'lucide-preact';
import { useBack } from '../../ui/back';
import { useOpeningTapGuard } from '../../ui/overlays';
import type { PhonePage } from '../nav';
import { mealsItem } from '../meals';
import { notesItem } from '../notes';
import { timerItem } from '../timer';
import { wallScreenItem } from '../wallscreen';
import type { MoreItem } from './items';
import { ThisPhone } from './ThisPhone';
import { starsItem } from '../stars';
import { peopleItem } from '../people';
import { prayerItem } from '../prayer';
import { moreView } from './view';

export { moreView };

/** The More tab's rows, in order. */
const MORE_ITEMS: MoreItem[] = [
  starsItem,
  peopleItem,
  timerItem,
  notesItem,
  mealsItem,
  wallScreenItem,
  prayerItem,
  { id: 'phone', label: 'This phone', icon: Smartphone, View: ThisPhone },
];

// An id no row has (kept by another version of the app) opens the list.
const kept = moreView.peek();
if (kept !== null && !MORE_ITEMS.some((i) => i.id === kept)) moreView.value = null;

function MoreBody() {
  const open = MORE_ITEMS.find((i) => i.id === moreView.value);
  // Keyed: a row opened from another one's view (Add a person in Stars) is a view of its own.
  if (open) return <MoreView key={open.id} item={open} />;
  return (
    <ul class="ph-menu">
      {MORE_ITEMS.map((i) => {
        const hint = i.hint?.();
        return (
          <li key={i.id}>
            <button type="button" onClick={() => (moreView.value = i.id)}>
              <i.icon size="2.4rem" strokeWidth={1.8} />
              <span class="ph-menu-label">
                {i.label}
                {hint && <small>{hint}</small>}
              </span>
              <ChevronRight size="2rem" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A row's view. It opens where the row was: the rest of a double tap on that presses nothing in it (useOpeningTapGuard). */
function MoreView({ item }: { item: MoreItem }) {
  useBack('view', () => (moreView.value = null), true);
  const guard = useOpeningTapGuard();
  return (
    <div class="ph-view" {...guard}>
      <item.View />
    </div>
  );
}

export const morePage: PhonePage = {
  id: 'more',
  label: 'More',
  icon: Ellipsis,
  title: () => MORE_ITEMS.find((i) => i.id === moreView.value)?.label ?? 'More',
  back: () => (moreView.value ? () => (moreView.value = null) : null),
  Body: MoreBody,
};
