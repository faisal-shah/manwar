import './lists.css';
import { ListCard } from './ListCard';
import { lists } from './state';

/** Home's "Lists" pane: one compact card per list with an Add item field and check-off, scrolling sideways. Fills its container. */
export function ListsPane() {
  const ls = lists.value;
  if (!ls.length) return <p class="lc-empty">No lists yet.</p>;
  return (
    <div class="lists-row pane">
      {ls.map((l) => (
        <ListCard key={l.id} list={l} compact />
      ))}
    </div>
  );
}
