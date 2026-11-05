import { ShoppingCart } from 'lucide-preact';
import type { PhonePage } from '../nav';
import { Placeholder } from '../placeholder';

export const listsPage: PhonePage = {
  id: 'lists',
  label: 'Lists',
  icon: ShoppingCart,
  Body: () => <Placeholder what="Lists" />,
};
