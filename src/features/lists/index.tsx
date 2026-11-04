import { List } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { Empty } from '../../ui/controls';

export const listsTab: TabDef = {
  id: 'lists',
  label: 'Lists',
  icon: List,
  Body: () => <Empty emoji="🚧">Lists is being built.</Empty>,
};
