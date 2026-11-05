import { signal } from '@preact/signals';
import { useMemo, useState } from 'preact/hooks';
import { Check, ShoppingCart } from 'lucide-preact';
import { asParent } from '../../core/lock';
import type { Recipe } from '../../data/types';
import { Button } from '../../ui/controls';
import { Modal, toast } from '../../ui/overlays';
import { ensureGroceryList, groceryList, itemsByList, mergeItems } from '../lists/state';
import { classifyIngredients } from './ingredients';
import { plural } from '../../lib/text';

/** Open request for the "Add to Grocery List" modal; <IngredientsHost/> is mounted once by the shell (app/tabs Overlays). */
const request = signal<Recipe | null>(null);

/** Ask which of a recipe's ingredients to add to the default grocery list. */
export function openIngredients(recipe: Recipe): void {
  void asParent(() => (request.value = recipe), 'Enter the PIN to add to the grocery list.');
}

export function IngredientsHost() {
  const r = request.value;
  return r ? <IngredientsModal key={r.id} recipe={r} onClose={() => (request.value = null)} /> : null;
}

/**
 * Each ingredient with a check (all on), merged into the default grocery
 * list: items already open on it are shown as such and never duplicated;
 * checked-off ones come back. Stays on the current tab afterwards.
 */
function IngredientsModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const list = groceryList.value;
  const listName = list?.title ?? 'Grocery List';
  // Classify once on open, so rows do not shift while the modal is up.
  const rows = useMemo(
    () => classifyIngredients(recipe.ingredients, list ? (itemsByList.value.get(list.id) ?? []) : []),
    [recipe.id],
  );
  const addable = rows.filter((r) => r.status !== 'onList');
  const [on, setOn] = useState<ReadonlySet<string>>(() => new Set(addable.map((r) => r.key)));
  const picked = addable.filter((r) => on.has(r.key));
  const toggle = (key: string) => {
    const next = new Set(on);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOn(next);
  };
  const add = () =>
    void asParent(() => {
      const target = ensureGroceryList();
      const undo = mergeItems(
        target,
        picked.map((r) => ({ name: r.name, qty: r.qty, reopenId: r.status === 'reopen' ? r.itemId : undefined })),
      );
      onClose();
      toast(`Added ${plural(picked.length, 'item')} to ${target.title}.`, {
        label: 'Undo',
        run: () => void asParent(undo),
      });
    });

  return (
    <Modal
      title={`Add to ${listName}?`}
      onClose={onClose}
      actions={
        addable.length ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              No thanks
            </Button>
            <Button variant="primary" disabled={!picked.length} onClick={add}>
              <ShoppingCart size="2.2rem" /> Add {plural(picked.length, 'item')}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onClose}>
            OK
          </Button>
        )
      }
    >
      <div class="ingredients-modal">
        <p class="im-lead">
          {recipe.emoji && <span class="im-emoji">{recipe.emoji}</span>}
          {addable.length
            ? `${recipe.name} ingredients. Uncheck what you already have.`
            : rows.length
              ? `Every ${recipe.name} ingredient is already on ${listName}.`
              : `${recipe.name} has no ingredients to add.`}
        </p>
        {addable.length > 1 && (
          <div class="im-all">
            <button type="button" class="btn btn-sm btn-ghost" onClick={() => setOn(new Set(addable.map((r) => r.key)))}>
              Select all
            </button>
            <button type="button" class="btn btn-sm btn-ghost" onClick={() => setOn(new Set())}>
              Select none
            </button>
          </div>
        )}
        <ul class="im-rows" role="list">
          {rows.map((r) => {
            const onList = r.status === 'onList';
            const checked = onList || on.has(r.key);
            return (
              <li key={r.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-disabled={onList}
                  class={`im-row${checked ? ' on' : ''}${onList ? ' on-list' : ''}`}
                  onClick={() => !onList && toggle(r.key)}
                >
                  <span class="box">{checked && <Check size="2.2rem" strokeWidth={3} />}</span>
                  <span class="im-text">{r.line}</span>
                  {onList && <span class="im-tag">On the list</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
