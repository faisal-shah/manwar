import '../../features/lists/lists.css';
import './lists.css';
import { useState } from 'preact/hooks';
import { ChevronRight, Ellipsis, List as ListIcon, Plus, ShoppingCart } from 'lucide-preact';
import { asParent } from '../../core/lock';
import type { List } from '../../data/types';
import { askDeleteList, listEditor, ListItems } from '../../features/lists/ListCard';
import { ListEditor } from '../../features/lists/ListEditor';
import { groupItems, listColor } from '../../features/lists/logic';
import { collapsed, deletedOnThisDevice, itemsByList, lists, settling, toggleCollapsed } from '../../features/lists/state';
import { useBack } from '../../ui/back';
import { Button, Empty, IconButton } from '../../ui/controls';
import { Popover, useCloseWhenGone, useOpeningTapGuard } from '../../ui/overlays';
import type { PhonePage } from '../nav';
import { listSummary, summaryLine } from './logic';
import { addingSection, clearDoneWithUndo, closeList, newList, openList, openListId, showList } from './state';

/** Every list, one row each: tap one to open it. */
function Overview() {
  const ls = lists.value;
  if (!ls.length)
    return (
      <div class="phl-empty">
        <Empty emoji="📝">No lists yet.</Empty>
        <Button variant="primary" onClick={newList}>
          <Plus size="2.2rem" /> New list
        </Button>
      </div>
    );
  return (
    <div class="ph-stack">
      <ul class="phl-lists">
        {ls.map((l) => {
          const s = listSummary(l, itemsByList.value.get(l.id) ?? []);
          return (
            <li key={l.id}>
              <button type="button" class="phl-row" style={{ '--c': listColor(l) }} onClick={() => showList(l.id)}>
                <span class="phl-tile" aria-hidden="true">
                  {l.emoji ?? <ListIcon size="2.4rem" />}
                </span>
                <span class="phl-row-text">
                  <span class="phl-row-title" dir="auto">
                    {l.title}
                  </span>
                  <small dir="auto">{summaryLine(s)}</small>
                </span>
                <span class="phl-count" aria-label={`${s.open} open`}>
                  {s.open}
                </span>
                <ChevronRight size="2rem" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" class="phl-new" onClick={newList}>
        <Plus size="2.2rem" /> New list
      </button>
    </div>
  );
}

/** One list, full screen: Add item at the top, its sections, the Done group at the bottom. */
function ListView({ list }: { list: List }) {
  useBack(closeList, true);
  const guard = useOpeningTapGuard();
  const view = groupItems(list, itemsByList.value.get(list.id) ?? [], settling.value);
  return (
    <section class="list-card phl-card" style={{ '--c': listColor(list) }} aria-label={list.title} {...guard}>
      <ListItems
        list={list}
        view={view}
        addingSection={addingSection.value}
        onSectionDone={() => (addingSection.value = false)}
        onClearDone={() => void clearDoneWithUndo(list)}
      />
    </section>
  );
}

/**
 * The open list as this tab last showed it. A list just made here is not in
 * the store for a moment, so the open list is gone only once it was there;
 * kept outside the tab, so a list deleted while another tab showed is
 * noticed on coming back.
 */
const lastShown = { id: null as string | null, title: '' };

function ListsBody() {
  const id = openListId.value;
  const list = openList.value;
  if (list) {
    lastShown.id = list.id;
    lastShown.title = list.title;
  }
  // A list deleted on another device closes with a word; one deleted here (its menu, the editor) needs none.
  const gone = !!id && !list && lastShown.id === id;
  const editing = !!id && listEditor.value?.list?.id === id;
  useCloseWhenGone(
    gone,
    closeList,
    gone && !editing && !deletedOnThisDevice(id) ? `${lastShown.title} was deleted on another device.` : undefined,
  );
  const ed = listEditor.value;
  return (
    <>
      {list ? <ListView key={list.id} list={list} /> : <Overview />}
      {ed && <ListEditor list={ed.list} onClose={() => (listEditor.value = null)} onCreated={(l) => showList(l.id)} />}
    </>
  );
}

/** The header's right side: New list on the lists, the list's menu on one list. */
function ListsAction() {
  const list = openList.value;
  if (!list)
    return (
      <IconButton label="New list" class="phl-head-btn" onClick={newList}>
        <Plus size="2.8rem" />
      </IconButton>
    );
  return <ListMenu key={list.id} list={list} />;
}

function ListMenu({ list }: { list: List }) {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const items = itemsByList.value.get(list.id) ?? [];
  const view = groupItems(list, items, settling.value);
  const done = view.done.length;
  const doneKey = `done:${list.id}`;
  const hidden = collapsed.value.has(doneKey);
  const fromMenu = (fn: () => unknown) => () => {
    setMenu(null);
    void fn();
  };
  return (
    <>
      <IconButton
        label={`${list.title} menu`}
        class="phl-head-btn"
        onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
      >
        <Ellipsis size="2.8rem" />
      </IconButton>
      {menu && (
        <Popover anchor={menu} width={34} onClose={() => setMenu(null)}>
          <div class="menu phl-menu" style={{ '--c': listColor(list) }}>
            <p class="phl-menu-title" dir="auto">
              {list.emoji && `${list.emoji} `}
              {list.title}
            </p>
            <button type="button" disabled={!done} onClick={fromMenu(() => toggleCollapsed(doneKey))}>
              {hidden ? 'Show done items' : 'Hide done items'}
            </button>
            <button type="button" disabled={!done} onClick={fromMenu(() => clearDoneWithUndo(list))}>
              Clear done ({done})
            </button>
            <button
              type="button"
              onClick={fromMenu(() => asParent(() => (addingSection.value = true), 'Enter the PIN to add a section.'))}
            >
              Add section
            </button>
            <button type="button" onClick={fromMenu(() => asParent(() => (listEditor.value = { list })))}>
              Edit list
            </button>
            <button
              type="button"
              class="danger"
              onClick={fromMenu(async () => (await askDeleteList(list, items.length)) && closeList())}
            >
              Delete list
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}

export const listsPage: PhonePage = {
  id: 'lists',
  label: 'Lists',
  icon: ShoppingCart,
  title: () => {
    const l = openList.value;
    return l ? `${l.emoji ? `${l.emoji} ` : ''}${l.title}` : 'Lists';
  },
  Action: ListsAction,
  back: () => (openListId.value ? closeList : null),
  Body: ListsBody,
};
