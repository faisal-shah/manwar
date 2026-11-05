import { signal } from '@preact/signals';
import { ChevronRight, Ellipsis, Smartphone } from 'lucide-preact';
import { useBack } from '../../ui/back';
import type { PhonePage } from '../nav';
import { mealsItem } from '../meals';
import { notesItem } from '../notes';
import { timerItem } from '../timer';
import { wallScreenItem } from '../wallscreen';
import type { MoreItem } from './items';
import { ThisPhone } from './ThisPhone';
import { starsItem } from '../stars';

/** The More tab's rows, in order. */
export const MORE_ITEMS: MoreItem[] = [
  starsItem,
  timerItem,
  notesItem,
  mealsItem,
  wallScreenItem,
  { id: 'phone', label: 'This phone', icon: Smartphone, View: ThisPhone },
];

/** The open row's view, null for the list. */
export const moreView = signal<string | null>(null);

function MoreBody() {
  const open = MORE_ITEMS.find((i) => i.id === moreView.value);
  if (open) return <MoreView item={open} />;
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

function MoreView({ item }: { item: MoreItem }) {
  useBack(() => (moreView.value = null), true);
  return <item.View />;
}

export const morePage: PhonePage = {
  id: 'more',
  label: 'More',
  icon: Ellipsis,
  title: () => MORE_ITEMS.find((i) => i.id === moreView.value)?.label ?? 'More',
  back: () => (moreView.value ? () => (moreView.value = null) : null),
  Body: MoreBody,
};
