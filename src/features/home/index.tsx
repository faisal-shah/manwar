import { House } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { Empty } from '../../ui/controls';

export const homeTab: TabDef = {
  id: 'home',
  label: 'Home',
  icon: House,
  Body: () => <Empty emoji="🚧">Home is being built.</Empty>,
};
