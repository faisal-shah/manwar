import { ListChecks } from 'lucide-preact';
import type { PhonePage } from '../nav';
import { Placeholder } from '../placeholder';

export const tasksPage: PhonePage = {
  id: 'tasks',
  label: 'Tasks',
  icon: ListChecks,
  Body: () => <Placeholder what="Tasks" />,
};
