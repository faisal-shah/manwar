import { BookOpen } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { Empty } from '../../ui/controls';

export const recipesTab: TabDef = {
  id: 'recipes',
  label: 'Recipes',
  icon: BookOpen,
  Body: () => <Empty emoji="🚧">Recipes is being built.</Empty>,
};
