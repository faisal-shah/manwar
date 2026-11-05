import { useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-preact';
import { asParent } from '../../core/lock';
import { newId } from '../../data/store';
import type { List, ListKind, ListSection } from '../../data/types';
import { Button, Field, IconButton, Segmented, SettingRow, Toggle } from '../../ui/controls';
import { Sheet, useCloseWhenGone } from '../../ui/overlays';
import { ColorSwatches, EmojiPicker } from '../../ui/pickers';
import { askDeleteList } from './ListCard';
import { KIND_COLORS, listColor } from './logic';
import { createList, itemsByList, lists, updateList } from './state';

const KINDS: { value: ListKind; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'grocery', label: 'Grocery' },
  { value: 'other', label: 'Other' },
];

/** New list or edit list: title, emoji, kind, color, sections, default grocery list. */
export function ListEditor({ list, onClose }: { list?: List; onClose: () => void }) {
  const [title, setTitle] = useState(list?.title ?? '');
  const [kind, setKind] = useState<ListKind>(list?.kind ?? 'todo');
  const [emoji, setEmoji] = useState(list?.emoji);
  const [color, setColor] = useState(list ? listColor(list) : KIND_COLORS.todo);
  const [colorTouched, setColorTouched] = useState(!!list?.color);
  const [sections, setSections] = useState<ListSection[]>(list?.sections ?? []);
  const [newSection, setNewSection] = useState('');
  const [isDefault, setIsDefault] = useState(!!list?.isDefaultGrocery);
  const [pickEmoji, setPickEmoji] = useState(false);
  const items = list ? (itemsByList.value.get(list.id) ?? []) : [];
  const count = (sid: string) => items.filter((i) => i.sectionId === sid).length;

  const addSection = () => {
    const name = newSection.trim();
    if (!name) return;
    setSections([...sections, { id: newId(), name }]);
    setNewSection('');
  };
  const moveSection = (i: number, d: -1 | 1) => {
    const next = [...sections];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSections(next);
  };
  useCloseWhenGone(
    !!list && !lists.value.some((l) => l.id === list.id),
    onClose,
    `${list?.title} was deleted on another device.`,
  );
  const save = () =>
    void asParent(() => {
      const named = sections.map((s) => ({ ...s, name: s.name.trim() })).filter((s) => s.name);
      const draft = { title: title.trim(), kind, emoji, color, sections: named, isDefaultGrocery: isDefault };
      if (list) updateList(list, draft);
      else createList(draft);
      onClose();
    });

  return (
    <Sheet
      title={list ? 'Edit list' : 'New list'}
      onClose={onClose}
      footer={
        <>
          {list && (
            <Button variant="danger" onClick={async () => (await askDeleteList(list, items.length)) && onClose()}>
              Delete list
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!title.trim()} onClick={save}>
            {list ? 'Save' : 'Add list'}
          </Button>
        </>
      }
    >
      <div class="list-editor">
        <Field label="Title">
          <div class="row">
            <button
              type="button"
              class="emoji-btn"
              aria-label={emoji ? `Emoji ${emoji}, change` : 'Choose an emoji'}
              onClick={() => setPickEmoji(!pickEmoji)}
            >
              {emoji ?? <Plus size="2.4rem" />}
            </button>
            <input
              class="input grow"
              value={title}
              aria-label="Title"
              placeholder="List name, e.g. To Do"
              onInput={(e: TargetedEvent<HTMLInputElement>) => setTitle(e.currentTarget.value)}
            />
          </div>
        </Field>
        {pickEmoji && (
          <div class="field">
            <EmojiPicker
              value={emoji}
              onChange={(e) => {
                setEmoji(e);
                if (e) setPickEmoji(false);
              }}
            />
          </div>
        )}
        <Field label="List type">
          <Segmented<ListKind>
            value={kind}
            options={KINDS}
            onChange={(k) => {
              setKind(k);
              if (!colorTouched) setColor(KIND_COLORS[k]);
            }}
          />
        </Field>
        <Field label="Color">
          <ColorSwatches
            value={color}
            onChange={(c) => {
              setColor(c);
              setColorTouched(true);
            }}
          />
        </Field>
        <Field label="Sections">
          <div class="section-editor">
            {sections.map((s, i) => (
              <div class="row section-row" key={s.id}>
                <input
                  class="input grow"
                  value={s.name}
                  aria-label={`Section ${i + 1} name`}
                  onInput={(e: TargetedEvent<HTMLInputElement>) =>
                    setSections(sections.map((x) => (x.id === s.id ? { ...x, name: e.currentTarget.value } : x)))
                  }
                />
                {count(s.id) > 0 && <span class="muted small">{count(s.id)} items</span>}
                <IconButton label={`Move ${s.name} up`} disabled={i === 0} onClick={() => moveSection(i, -1)}>
                  <ArrowUp size="2.2rem" />
                </IconButton>
                <IconButton label={`Move ${s.name} down`} disabled={i === sections.length - 1} onClick={() => moveSection(i, 1)}>
                  <ArrowDown size="2.2rem" />
                </IconButton>
                <IconButton label={`Remove ${s.name}`} onClick={() => setSections(sections.filter((x) => x.id !== s.id))}>
                  <X size="2.2rem" />
                </IconButton>
              </div>
            ))}
            <form
              class="row"
              onSubmit={(e) => {
                e.preventDefault();
                addSection();
              }}
            >
              <input
                class="input grow"
                value={newSection}
                placeholder="New section, e.g. Produce"
                onInput={(e: TargetedEvent<HTMLInputElement>) => setNewSection(e.currentTarget.value)}
              />
              <Button type="submit" disabled={!newSection.trim()}>
                Add section
              </Button>
            </form>
            {list && sections.length < list.sections.length && (
              <span class="muted small">Items in a removed section stay on the list without a section.</span>
            )}
          </div>
        </Field>
        <SettingRow
          label="Recipe ingredients go here"
          hint={
            list?.isDefaultGrocery
              ? 'This is the grocery list for Meals and Recipes. Turn it on for another list to move it.'
              : 'Add ingredients from Meals and Recipes to this list.'
          }
        >
          <Toggle
            label="Recipe ingredients go here"
            on={isDefault}
            onChange={(v) => !list?.isDefaultGrocery && setIsDefault(v)}
          />
        </SettingRow>
      </div>
    </Sheet>
  );
}
