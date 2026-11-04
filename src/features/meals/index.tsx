import { Utensils } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { Empty } from '../../ui/controls';

export const mealsTab: TabDef = {
  id: 'meals',
  label: 'Meals',
  icon: Utensils,
  Body: () => <Empty emoji="🚧">Meals is being built.</Empty>,
};
