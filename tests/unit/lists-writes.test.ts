import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { List, ListItem } from '../../src/data/types';

/**
 * List writes against an in-memory stand-in for the store whose server can
 * refuse a write, as Firestore's does when the document was deleted on
 * another device (code not-found).
 */

vi.mock('firebase/firestore', () => ({
  arrayUnion: (...v: unknown[]) => ({ union: v }),
  deleteField: () => 'DELETE',
  increment: (n: number) => ({ increment: n }),
}));

const toasts = vi.hoisted(() => [] as string[]);
vi.mock('../../src/ui/overlays', () => ({ toast: (text: string) => void toasts.push(text) }));

type Op = [op: string, collection: string, value: unknown];
const server = vi.hoisted(() => ({
  ops: [] as Op[],
  /** The error each next write is refused with, in order (null: taken). */
  refuse: [] as (null | { code: string; message: string })[],
}));
vi.mock('../../src/data/store', async () => {
  const { signal } = await import('@preact/signals');
  const answer = async () => {
    const e = server.refuse.shift();
    if (e) throw Object.assign(new Error(e.message), e);
  };
  const write = (op: string, name: string, value: unknown) => {
    server.ops.push([op, name, value]);
    return answer();
  };
  const batch = () => {
    const ops: Op[] = [];
    const api = {
      put: (name: string, v: unknown) => (ops.push(['put', name, v]), api),
      patch: (name: string, id: string, v: object) => (ops.push(['patch', name, { id, ...v }]), api),
      upsert: (name: string, id: string, v: object) => (ops.push(['upsert', name, { id, ...v }]), api),
      remove: (name: string, id: string) => (ops.push(['remove', name, id]), api),
      commit: () => {
        server.ops.push(['batch', '', ops]);
        return answer();
      },
    };
    return api;
  };
  return {
    data: { lists: signal<List[]>([]), listItems: signal<ListItem[]>([]), groceryMemory: signal([]) },
    batch,
    fieldChanges: (p: object) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === undefined ? 'DELETE' : v])),
    newId: () => 'new-id',
    patch: (name: string, id: string, v: object) => write('patch', name, { id, ...v }),
    put: (name: string, v: unknown) => write('put', name, v),
    remove: (name: string, id: string) => write('remove', name, id),
    transaction: vi.fn(),
    householdId: signal('h'),
    settings: signal({}),
    whenConfirmed: vi.fn(),
  };
});

const { data } = await import('../../src/data/store');
const { clearDone, restoreItems, setDone } = await import('../../src/features/lists/state');

const grocery: List = { id: 'g', title: 'Grocery List', kind: 'grocery', sections: [], order: 0, createdAt: 0 };
const milk: ListItem = {
  id: 'g-milk',
  listId: 'g',
  text: 'Milk',
  qty: '2 gal',
  done: true,
  doneAt: 50,
  order: 3,
  createdAt: 1,
};
const settled = () => new Promise((r) => setTimeout(r, 0));

describe('list writes', () => {
  beforeEach(() => {
    server.ops.length = 0;
    server.refuse.length = 0;
    toasts.length = 0;
    data.lists.value = [grocery];
    data.listItems.value = [milk];
  });

  it('writes back an item unchecked offline after it was cleared on another device', async () => {
    server.refuse.push({ code: 'not-found', message: 'No document to update' });
    setDone(milk, false);
    await settled();
    expect(server.ops).toEqual([
      ['patch', 'listItems', { id: 'g-milk', done: false }],
      ['put', 'listItems', { id: 'g-milk', listId: 'g', text: 'Milk', qty: '2 gal', done: false, order: 3, createdAt: 1 }],
    ]);
    expect(toasts).toEqual([]);
  });

  it('writes nothing back onto a list deleted meanwhile, and says other refusals', async () => {
    data.lists.value = [];
    server.refuse.push({ code: 'not-found', message: 'No document to update' });
    setDone(milk, false);
    await settled();
    expect(server.ops).toHaveLength(1);
    data.lists.value = [grocery];
    server.refuse.push({ code: 'permission-denied', message: 'Missing or insufficient permissions.' });
    setDone(milk, false);
    await settled();
    expect(toasts).toEqual(['⁨Milk⁩ was not unchecked: Missing or insufficient permissions.']);
  });

  it('puts back only the cleared items whose id nothing has taken since', async () => {
    const eggs: ListItem = { ...milk, id: 'g-eggs', text: 'Eggs' };
    const cleared = [milk, eggs];
    // "Milk" was added again (the same id: one list, one item key) before the Undo.
    data.listItems.value = [{ ...milk, done: false, doneAt: undefined, createdAt: 99 }];
    restoreItems(cleared);
    await settled();
    expect(server.ops).toEqual([['batch', '', [['put', 'listItems', eggs]]]]);
  });

  it('says so when a clear is refused, rather than the items coming back silently', async () => {
    server.refuse.push({ code: 'resource-exhausted', message: 'Quota exceeded.' });
    expect(clearDone(grocery)).toEqual([milk]);
    await settled();
    expect(toasts).toEqual(['The done items were not cleared from ⁨Grocery List⁩: Quota exceeded.']);
  });
});
