import { batch as signalBatch, computed, signal, type Signal } from '@preact/signals';
import {
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  limit,
  type DocumentReference,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { addDays } from '../lib/date';
import { currentTime } from '../lib/clock';
import { toISODate } from '../lib/date';
import { DEFAULT_SETTINGS, mergeSettings } from './settings';
import type {
  EventMeta,
  LedgerEntry,
  List,
  ListItem,
  MealEntry,
  Message,
  Profile,
  Recipe,
  Reward,
  Settings,
  Task,
  TaskState,
} from './types';

/** Every household collection and its document type. */
export interface Collections {
  profiles: Profile;
  tasks: Task;
  taskStates: TaskState;
  ledger: LedgerEntry;
  rewards: Reward;
  lists: List;
  listItems: ListItem;
  meals: MealEntry;
  recipes: Recipe;
  messages: Message;
  eventMeta: EventMeta;
}
export type CollectionName = keyof Collections;

const NAMES: CollectionName[] = [
  'profiles',
  'tasks',
  'taskStates',
  'ledger',
  'rewards',
  'lists',
  'listItems',
  'meals',
  'recipes',
  'messages',
  'eventMeta',
];

/** Live contents of each collection, updated by Firestore snapshots (local writes show immediately). */
export const data = Object.fromEntries(NAMES.map((n) => [n, signal<unknown[]>([])])) as {
  [K in CollectionName]: Signal<Collections[K][]>;
};

export const settings = signal<Settings>(DEFAULT_SETTINGS);

/** Household id of the signed-in tablet, null until signed in. */
export const householdId = signal<string | null>(null);

/** True once every collection has delivered its first snapshot. */
export const ready = signal(false);

export const profiles = computed(() => [...data.profiles.value].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt));
export const profileById = computed(() => new Map(profiles.value.map((p) => [p.id, p])));

let unsubs: Unsubscribe[] = [];

function hid(): string {
  const h = householdId.value;
  if (!h) throw new Error('store: not signed in');
  return h;
}

export const colRef = (name: CollectionName) => collection(db, 'households', hid(), name);
export const docRef = (name: CollectionName, id: string) => doc(db, 'households', hid(), name, id);
const settingsRef = () => doc(db, 'households', hid(), 'settings', 'main');

/** Start listening to a household. Called by the session once signed in. */
export function openHousehold(id: string): void {
  closeHousehold();
  householdId.value = id;
  const pending = new Set<string>([...NAMES, 'settings']);
  const arrived = (name: string) => {
    pending.delete(name);
    if (pending.size === 0) ready.value = true;
  };
  const since = toISODate(new Date(currentTime() - 62 * 86_400_000));
  for (const name of NAMES) {
    let q: Query = colRef(name);
    // Bounded history for the two collections that grow without limit.
    if (name === 'taskStates') q = query(q, where('date', '>=', since));
    if (name === 'ledger') q = query(q, orderBy('at', 'desc'), limit(1000));
    unsubs.push(
      onSnapshot(q, (snap) => {
        data[name].value = snap.docs.map((d) => d.data()) as never;
        arrived(name);
      }),
    );
  }
  unsubs.push(
    onSnapshot(settingsRef(), (snap) => {
      settings.value = mergeSettings(snap.exists() ? snap.data() : {});
      arrived('settings');
    }),
  );
}

export function closeHousehold(): void {
  unsubs.forEach((u) => u());
  unsubs = [];
  signalBatch(() => {
    for (const name of NAMES) data[name].value = [];
    settings.value = DEFAULT_SETTINGS;
    ready.value = false;
    householdId.value = null;
  });
}

export const newId = () => doc(collection(db, '_ids')).id;

/*
 * Writes. They apply to the local cache at once (snapshots fire
 * immediately) and sync when online, so callers do not await them for UI.
 */

export function put<K extends CollectionName>(name: K, value: Collections[K]): Promise<void> {
  return setDoc(docRef(name, value.id), value as object);
}

export function patch<K extends CollectionName>(name: K, id: string, partial: Partial<Collections[K]>): Promise<void> {
  return updateDoc(docRef(name, id), partial as object);
}

export function remove(name: CollectionName, id: string): Promise<void> {
  return deleteDoc(docRef(name, id));
}

export function saveSettings(partial: Partial<Settings>): Promise<void> {
  return setDoc(settingsRef(), partial, { merge: true });
}

/** Atomic multi-document write. */
export function batch() {
  const b = writeBatch(db);
  const api = {
    put<K extends CollectionName>(name: K, value: Collections[K]) {
      b.set(docRef(name, value.id), value as object);
      return api;
    },
    patch<K extends CollectionName>(name: K, id: string, partial: Partial<Collections[K]>) {
      b.update(docRef(name, id), partial as object);
      return api;
    },
    remove(name: CollectionName, id: string) {
      b.delete(docRef(name, id));
      return api;
    },
    /** Adjust a profile's star balance by delta. */
    stars(profileId: string, delta: number) {
      b.update(docRef('profiles', profileId) as DocumentReference, { stars: increment(delta) });
      return api;
    },
    commit: () => b.commit(),
  };
  return api;
}

export const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((x) => [x.id, x]));

/** ISO date `n` days from today, for queries and seeds. */
export const daysFromToday = (n: number) => addDays(toISODate(new Date(currentTime())), n);
