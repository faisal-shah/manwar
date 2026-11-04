import { Check } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { Empty } from '../../ui/controls';

export const tasksTab: TabDef = {
  id: 'tasks',
  label: 'Tasks',
  icon: Check,
  Body: () => <Empty emoji="🚧">Tasks is being built.</Empty>,
};
