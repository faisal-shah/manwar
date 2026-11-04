import { Star } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { Empty } from '../../ui/controls';

export const rewardsTab: TabDef = {
  id: 'rewards',
  label: 'Rewards',
  icon: Star,
  Body: () => <Empty emoji="🚧">Rewards is being built.</Empty>,
};
