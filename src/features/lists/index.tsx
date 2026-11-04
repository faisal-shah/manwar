import './lists.css';
import { List } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { asParent } from '../../core/lock';
import { Empty } from '../../ui/controls';
import { ListCard, listEditor } from './ListCard';
import { ListEditor } from './ListEditor';
import { lists } from './state';

function ListsBody() {
  const ls = lists.value;
  const ed = listEditor.value;
  return (
    <>
      {ls.length ? (
        <div class="lists-row">
          {ls.map((l) => (
            <ListCard key={l.id} list={l} />
          ))}
        </div>
      ) : (
        <Empty emoji="📝">No lists yet. Tap + to make one.</Empty>
      )}
      {ed && <ListEditor list={ed.list} onClose={() => (listEditor.value = null)} />}
    </>
  );
}

export const listsTab: TabDef = {
  id: 'lists',
  label: 'Lists',
  icon: List,
  Body: ListsBody,
  onAdd: () => void asParent(() => (listEditor.value = {}), 'Enter the PIN to add a list.'),
};
