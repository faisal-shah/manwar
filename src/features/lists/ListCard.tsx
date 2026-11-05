import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Ellipsis, Plus, X } from 'lucide-preact';
import { asParent, pinRequest, requireParent, unlocked } from '../../core/lock';
import { put } from '../../data/store';
import type { List, ListItem } from '../../data/types';
import { Button, Chips } from '../../ui/controls';
import { Popover, confirm, toast } from '../../ui/overlays';
import { parseIngredient } from '../meals/ingredients';
import { groupItems, listColor, moveBy, reorder, sectionOf, topOrder, type ListView } from './logic';
import {
  addItem,
  addSection,
  applyOrder,
  clearDone,
  collapsed,
  deleteItem,
  deleteList,
  itemsByList,
  lists,
  setDone,
  settling,
  toggleCollapsed,
  updateItem,
} from './state';

/** The list editor sheet (new list or edit), opened from the + button or a card menu. Hosted by the Lists tab body. */
export const listEditor = signal<{ list?: List } | null>(null);

/**
 * Ask for the PIN before a field that creates things takes focus, so a kid
 * is stopped before typing rather than after.
 */
function gateFocus(e: Event, reason: string) {
  if (unlocked.value) return;
  e.preventDefault();
  const input = e.currentTarget as HTMLInputElement;
  input.blur();
  // pointerdown and focus both land here on one tap; ask once.
  if (pinRequest.value) return;
  void requireParent(reason).then((ok) => ok && input.focus());
}

type Drop = { sectionId: string | null; beforeId: string | null; y: number };

/** One list as a tall card: header, Add item, sections, Done group. `compact` is the Home pane version (no menu, no drag). */
export function ListCard({ list, compact }: { list: List; compact?: boolean }) {
  const items = itemsByList.value.get(list.id) ?? [];
  const view = groupItems(list, items, settling.value);
  const [editing, setEditing] = useState<{ item: ListItem; anchor: DOMRect } | null>(null);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const drag = useDrag(list, view, body, !compact);
  const doneKey = `done:${list.id}`;
  const reveal = useReveal(body);

  const fromMenu = (fn: () => Promise<unknown>) => () => {
    setMenu(null);
    void fn();
  };

  const openEditor = (item: ListItem, el: HTMLElement) => {
    if (drag.consumeClick()) return;
    const anchor = el.getBoundingClientRect();
    void asParent(() => setEditing({ item, anchor }), 'Enter the PIN to change list items.');
  };

  const row = (item: ListItem) => {
    const checked = item.done || settling.value.has(item.id);
    const lifted = drag.state?.id === item.id;
    return (
      <div
        key={item.id}
        class={`li-row${checked ? ' checked' : ''}${lifted ? ' lifted' : ''}`}
        data-item={item.id}
        data-drop={item.done ? undefined : `item:${item.id}`}
        data-section={sectionOf(list, item) ?? ''}
        style={lifted ? { transform: `translateY(${drag.state!.dy}px)` } : undefined}
        onPointerDown={item.done ? undefined : (e) => drag.press(e, item)}
      >
        <button type="button" class="li-text" onClick={(e) => openEditor(item, e.currentTarget.parentElement!)}>
          <span>{item.text}</span>
          {item.qty && <span class="li-qty">{item.qty}</span>}
        </button>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`${checked ? 'Uncheck' : 'Check off'} ${item.text}`}
          class="li-check"
          onClick={() => setDone(item, !checked)}
        >
          <span class="box">{checked && <Check size="2.4rem" strokeWidth={3} />}</span>
        </button>
      </div>
    );
  };

  return (
    <section class={`list-card${compact ? ' compact' : ''}`} style={{ '--c': listColor(list) }} aria-label={list.title}>
      <header class="lc-head">
        {list.emoji && <span class="lc-emoji">{list.emoji}</span>}
        <h3 class="lc-title">{list.title}</h3>
        <span class="lc-count" aria-label={`${view.open} open items`}>
          {view.open}
        </span>
        {!compact && (
          <button
            type="button"
            class="lc-icon"
            aria-label={`${list.title} menu`}
            onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
          >
            <Ellipsis size="2.6rem" />
          </button>
        )}
      </header>
      <AddItemField list={list} sectionId={null} onAdded={reveal} />
      <div class="lc-body scroll" ref={body}>
        {drag.state?.drop && <div class="drop-line" style={{ top: `${drag.state.drop.y}px` }} />}
        {view.groups.map((g) =>
          g.section === null ? (
            g.items.map(row)
          ) : (
            <div class="ls-group" key={g.section.id}>
              <div class="ls-head" data-drop={`head:${g.section.id}`}>
                <button type="button" class="ls-title" onClick={() => toggleCollapsed(g.section!.id)}>
                  {g.section.name}
                </button>
                <span class="ls-count">{g.items.filter((i) => !i.done).length}</span>
                {!compact && (
                  <button
                    type="button"
                    class="lc-icon"
                    aria-label={`Add to ${g.section.name}`}
                    onClick={() =>
                      void asParent(() => {
                        if (collapsed.value.has(g.section!.id)) toggleCollapsed(g.section!.id);
                        setAddingIn(g.section!.id);
                      }, 'Enter the PIN to add items.')
                    }
                  >
                    <Plus size="2.4rem" />
                  </button>
                )}
                <button
                  type="button"
                  class="lc-icon"
                  aria-label={collapsed.value.has(g.section.id) ? `Expand ${g.section.name}` : `Collapse ${g.section.name}`}
                  onClick={() => toggleCollapsed(g.section!.id)}
                >
                  {collapsed.value.has(g.section.id) ? <ChevronDown size="2.4rem" /> : <ChevronUp size="2.4rem" />}
                </button>
              </div>
              {addingIn === g.section.id && (
                <AddItemField list={list} sectionId={g.section.id} autoFocus onAdded={reveal} onDone={() => setAddingIn(null)} />
              )}
              {!collapsed.value.has(g.section.id) && g.items.map(row)}
            </div>
          ),
        )}
        {!items.length && !list.sections.length && <p class="lc-empty">Nothing on this list yet.</p>}
        {view.done.length > 0 && (
          <div class="ls-group">
            <div class="ls-head done-head" data-drop="end">
              <button type="button" class="ls-title" onClick={() => toggleCollapsed(doneKey)}>
                Done
              </button>
              <span class="ls-count">{view.done.length}</span>
              {!compact && (
                <button type="button" class="btn btn-sm btn-ghost" onClick={() => void askClearDone(list, view.done.length)}>
                  Clear
                </button>
              )}
              <button
                type="button"
                class="lc-icon"
                aria-label={collapsed.value.has(doneKey) ? 'Show done items' : 'Hide done items'}
                onClick={() => toggleCollapsed(doneKey)}
              >
                {collapsed.value.has(doneKey) ? <ChevronDown size="2.4rem" /> : <ChevronUp size="2.4rem" />}
              </button>
            </div>
            {!collapsed.value.has(doneKey) && view.done.map(row)}
          </div>
        )}
        {!compact && (addingSection || list.sections.length > 0 || items.length > 0) && (
          <AddSectionField list={list} autoFocus={addingSection} onDone={() => setAddingSection(false)} />
        )}
      </div>
      {editing && (
        <ItemEditor list={list} view={view} item={editing.item} anchor={editing.anchor} onClose={() => setEditing(null)} />
      )}
      {menu && (
        <Popover anchor={menu} width={34} onClose={() => setMenu(null)}>
          <div class="menu">
            <button type="button" onClick={fromMenu(() => asParent(() => (listEditor.value = { list })))}>
              Edit list
            </button>
            <button type="button" onClick={fromMenu(() => asParent(() => setAddingSection(true)))}>
              Add section
            </button>
            <button type="button" disabled={!view.done.length} onClick={fromMenu(() => askClearDone(list, view.done.length))}>
              Clear done ({view.done.length})
            </button>
            <button type="button" class="danger" onClick={fromMenu(() => askDeleteList(list, items.length))}>
              Delete list
            </button>
          </div>
        </Popover>
      )}
    </section>
  );
}

async function askClearDone(list: List, n: number) {
  await asParent(async () => {
    if (
      !(await confirm(`Clear ${n} done item${n === 1 ? '' : 's'}?`, {
        body: `They are removed from ${list.title}.`,
        ok: 'Clear',
        danger: true,
      }))
    )
      return;
    clearDone(list);
  });
}

export async function askDeleteList(list: List, n: number): Promise<boolean> {
  let deleted = false;
  await asParent(async () => {
    const body = n ? `The list and its ${n} item${n === 1 ? '' : 's'} are deleted.` : 'The list is deleted.';
    if (!(await confirm(`Delete ${list.title}?`, { body: `${body} This cannot be undone.`, ok: 'Delete', danger: true }))) return;
    deleteList(list);
    deleted = true;
    toast(`Deleted ${list.title}`);
  });
  return deleted;
}

/**
 * Scroll a row into view once it is on screen: the item just added (at the
 * top of its section, which may be scrolled away in a long list), reopened,
 * or already on the list. Gives up after a moment if it never shows (its
 * section collapsed).
 */
function useReveal(body: { current: HTMLDivElement | null }) {
  const [target, setTarget] = useState<{ id: string; until: number } | null>(null);
  useEffect(() => {
    if (!target) return;
    const el = body.current?.querySelector<HTMLElement>(`[data-item="${target.id}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (el || Date.now() > target.until) setTarget(null);
  });
  return (id: string) => setTarget({ id, until: Date.now() + 1500 });
}

function AddItemField({
  list,
  sectionId,
  autoFocus,
  onAdded,
  onDone,
}: {
  list: List;
  sectionId: string | null;
  autoFocus?: boolean;
  /** The item added, reopened or found already on the list. */
  onAdded: (id: string) => void;
  onDone?: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const submit = () => {
    const raw = text.trim();
    if (!raw) return;
    void asParent(() => {
      // Grocery lists keep a leading quantity in its own field ("2 gal milk").
      const p = list.kind === 'grocery' ? parseIngredient(raw) : null;
      const r = addItem(list, p?.name ?? raw, sectionId, p?.qty);
      if (r.kind === 'already') toast(`${r.item.text} is already on ${list.title}.`);
      onAdded(r.item.id);
      setText('');
    }, 'Enter the PIN to add items.');
  };
  return (
    <form
      class={`li-add${text ? ' typing' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        ref={ref}
        class="li-add-input"
        placeholder="Add item"
        aria-label={`Add item to ${list.title}`}
        value={text}
        enterKeyHint="done"
        autoComplete="off"
        onPointerDown={(e) => gateFocus(e, 'Enter the PIN to add items.')}
        onFocus={(e) => gateFocus(e, 'Enter the PIN to add items.')}
        onInput={(e: TargetedEvent<HTMLInputElement>) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setText('');
            e.currentTarget.blur();
          }
        }}
        onBlur={() => !text.trim() && onDone?.()}
      />
      {text && (
        <button
          type="button"
          class="lc-icon"
          aria-label="Clear"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setText('')}
        >
          <X size="2.4rem" />
        </button>
      )}
      {text.trim() && (
        <button type="submit" class="li-add-ok" aria-label="Add" onPointerDown={(e) => e.preventDefault()}>
          <Check size="2.6rem" strokeWidth={2.6} />
        </button>
      )}
    </form>
  );
}

function AddSectionField({ list, autoFocus, onDone }: { list: List; autoFocus: boolean; onDone: () => void }) {
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, [autoFocus]);
  return (
    <form
      class="ls-add"
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return;
        void asParent(() => {
          addSection(list, n);
          setName('');
        }, 'Enter the PIN to add a section.');
      }}
    >
      <input
        ref={ref}
        placeholder="Add section"
        aria-label={`Add section to ${list.title}`}
        value={name}
        enterKeyHint="done"
        autoComplete="off"
        onPointerDown={(e) => gateFocus(e, 'Enter the PIN to add a section.')}
        onFocus={(e) => gateFocus(e, 'Enter the PIN to add a section.')}
        onInput={(e: TargetedEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
        onBlur={() => !name.trim() && onDone()}
      />
      {name.trim() && (
        <button type="submit" class="li-add-ok" aria-label="Add section" onPointerDown={(e) => e.preventDefault()}>
          <Check size="2.6rem" strokeWidth={2.6} />
        </button>
      )}
    </form>
  );
}

function ItemEditor({
  list,
  view,
  item: opened,
  anchor,
  onClose,
}: {
  list: List;
  view: ListView;
  item: ListItem;
  anchor: DOMRect;
  onClose: () => void;
}) {
  // The fields start from the item as opened; order, section and done follow the live item.
  const live = (itemsByList.value.get(list.id) ?? []).find((i) => i.id === opened.id);
  const item = live ?? opened;
  const from = sectionOf(list, item);
  const [text, setText] = useState(opened.text);
  const [qty, setQty] = useState(opened.qty ?? '');
  const [section, setSection] = useState<string | null>(sectionOf(list, opened));
  // Deleted elsewhere (another device, or Clear done): nothing left to edit.
  useEffect(() => {
    if (!live) onClose();
  }, [!live]);
  const group = view.groups.find((g) => (g.section?.id ?? null) === from)?.items.filter((i) => !i.done) ?? [];
  const idx = group.findIndex((i) => i.id === item.id);
  const save = () =>
    void asParent(() => {
      const order = section !== from ? topOrder(list, itemsByList.value.get(list.id) ?? [], section) : undefined;
      updateItem(item.id, text.trim(), qty, section, order);
      onClose();
    });
  const move = (d: -1 | 1) => void asParent(() => applyOrder(moveBy(group, item.id, d, from)));
  const del = () =>
    void asParent(() => {
      void deleteItem(item);
      onClose();
      // The undo brings the item back only onto a list that still exists (not one deleted since on another device).
      const restore = () => lists.value.some((l) => l.id === item.listId) && void put('listItems', item);
      toast(`Deleted ${item.text}`, { label: 'Undo', run: () => void asParent(restore) });
    });
  return (
    <Popover anchor={anchor} width={48} onClose={onClose}>
      <form
        class="item-editor"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) save();
        }}
      >
        <div class="row">
          <label class="field grow">
            <span class="field-label">Item</span>
            <input class="input" value={text} onInput={(e: TargetedEvent<HTMLInputElement>) => setText(e.currentTarget.value)} />
          </label>
          <label class="field qty">
            <span class="field-label">Quantity</span>
            <input
              class="input"
              value={qty}
              placeholder="2 lb"
              onInput={(e: TargetedEvent<HTMLInputElement>) => setQty(e.currentTarget.value)}
            />
          </label>
        </div>
        {list.sections.length > 0 && (
          <div class="field">
            <span class="field-label">Section</span>
            <Chips<string>
              value={[section ?? '']}
              options={[{ value: '', label: 'None' }, ...list.sections.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={([v]) => setSection(v || null)}
            />
          </div>
        )}
        {!item.done && group.length > 1 && (
          <div class="row move-row">
            <Button small disabled={idx <= 0} onClick={() => move(-1)}>
              <ArrowUp size="2rem" /> Move up
            </Button>
            <Button small disabled={idx >= group.length - 1} onClick={() => move(1)}>
              <ArrowDown size="2rem" /> Move down
            </Button>
          </div>
        )}
        <div class="row editor-actions">
          <Button variant="danger" onClick={del}>
            Delete
          </Button>
          <span class="grow" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!text.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Popover>
  );
}

/* ---------- Long-press drag to reorder ---------- */

const LIFT_MS = 420;
const SLOP_PX = 10;
const EDGE_PX = 70;

/**
 * Long-press an open item to lift it, drag, release to drop it before the
 * item under the finger (or at the end of a section). Moving before the
 * long press fires cancels it, so the card still scrolls normally.
 */
function useDrag(list: List, view: ListView, body: { current: HTMLDivElement | null }, enabled: boolean) {
  const [state, setState] = useState<{ id: string; dy: number; drop: Drop | null } | null>(null);
  const r = useRef({
    timer: 0,
    startX: 0,
    startY: 0,
    startScroll: 0,
    lastY: 0,
    item: null as ListItem | null,
    lifted: false,
    suppressClick: false,
    raf: 0,
    drop: null as Drop | null,
    cleanup: () => {},
  }).current;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => () => r.cleanup(), []);

  const computeDrop = (clientY: number): Drop | null => {
    const el = body.current;
    if (!el || !r.item) return null;
    const box = el.getBoundingClientRect();
    const toY = (y: number) => y - box.top + el.scrollTop;
    const marks = [...el.querySelectorAll<HTMLElement>('[data-drop]')].filter((m) => m.dataset.drop !== `item:${r.item!.id}`);
    const sectionFrom = (m: HTMLElement): string | null => {
      const d = m.dataset.drop!;
      if (d.startsWith('head:')) return d.slice(5);
      return m.dataset.section || null;
    };
    const endAfter = (prev: HTMLElement | undefined): Drop => {
      if (!prev) return { sectionId: null, beforeId: null, y: 0 };
      const rect = prev.getBoundingClientRect();
      return { sectionId: sectionFrom(prev), beforeId: null, y: toY(rect.bottom) + 2 };
    };
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const rect = m.getBoundingClientRect();
      if (rect.top + rect.height / 2 <= clientY) continue;
      const d = m.dataset.drop!;
      if (d.startsWith('item:')) return { sectionId: sectionFrom(m), beforeId: d.slice(5), y: toY(rect.top) - 3 };
      return endAfter(marks[i - 1]);
    }
    const last = marks[marks.length - 1];
    return last?.dataset.drop === 'end' ? endAfter(marks[marks.length - 2]) : endAfter(last);
  };

  const update = () => {
    const el = body.current;
    if (!el || !r.lifted) return;
    r.drop = computeDrop(r.lastY);
    setState({ id: r.item!.id, dy: r.lastY - r.startY + (el.scrollTop - r.startScroll), drop: r.drop });
  };

  const drop = () => {
    const item = r.item;
    const target = r.drop;
    if (!item || !target) return;
    const group =
      viewRef.current.groups.find((g) => (g.section?.id ?? null) === target.sectionId)?.items.filter((i) => !i.done) ?? [];
    const without = group.filter((i) => i.id !== item.id);
    const index = target.beforeId ? without.findIndex((i) => i.id === target.beforeId) : without.length;
    void asParent(() =>
      applyOrder(reorder(group, item, target.sectionId, sectionOf(list, item), index < 0 ? without.length : index)),
    );
  };

  const lift = () => {
    if (!r.item) return;
    if (!unlocked.value) {
      void requireParent('Enter the PIN to reorder items.');
      r.cleanup();
      return;
    }
    r.lifted = true;
    r.startScroll = body.current?.scrollTop ?? 0;
    navigator.vibrate?.(12);
    const tick = () => {
      const el = body.current;
      if (!el || !r.lifted) return;
      const box = el.getBoundingClientRect();
      const v = r.lastY < box.top + EDGE_PX ? -14 : r.lastY > box.bottom - EDGE_PX ? 14 : 0;
      if (v) {
        el.scrollTop += v;
        update();
      }
      r.raf = requestAnimationFrame(tick);
    };
    r.raf = requestAnimationFrame(tick);
    update();
  };

  const press = (e: PointerEvent, item: ListItem) => {
    if (!enabled || e.button !== 0 || (e.target as HTMLElement).closest('.li-check')) return;
    r.cleanup();
    r.item = item;
    r.startX = e.clientX;
    r.startY = r.lastY = e.clientY;
    r.lifted = false;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!r.lifted) {
        if (Math.hypot(ev.clientX - r.startX, ev.clientY - r.startY) > SLOP_PX) r.cleanup();
        return;
      }
      r.lastY = ev.clientY;
      update();
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (r.lifted) {
        r.suppressClick = true;
        setTimeout(() => (r.suppressClick = false), 400);
        if (ev.type === 'pointerup') drop();
      }
      r.cleanup();
    };
    // Once lifted, keep the browser from scrolling the card under the finger.
    const onTouchMove = (ev: TouchEvent) => r.lifted && ev.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    r.timer = window.setTimeout(lift, LIFT_MS);
    r.cleanup = () => {
      clearTimeout(r.timer);
      cancelAnimationFrame(r.raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      const was = r.lifted;
      r.lifted = false;
      r.item = null;
      r.drop = null;
      r.cleanup = () => {};
      if (was) setState(null);
    };
  };

  /** True (once) when the click that follows a drop should not open the editor. */
  const consumeClick = () => {
    const s = r.suppressClick;
    r.suppressClick = false;
    return s;
  };

  return { state, press, consumeClick };
}
