import { House } from 'lucide-preact';
import type { PhonePage } from '../nav';
import { Placeholder } from '../placeholder';

export const todayPage: PhonePage = {
  id: 'today',
  label: 'Today',
  icon: House,
  Body: () => <Placeholder what="Today" />,
};
