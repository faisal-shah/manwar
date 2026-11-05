import { batch as signalBatch, computed, signal, type Signal } from '@preact/signals';
import {
  collection,
  deleteField,
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
  type FirestoreError,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { errorMessage } from './errors';
import { db } from './firebase';
import { addDays } from '../lib/date';
import { currentTime } from '../lib/clock';
import { toISODate } from '../lib/date';
import { HISTORY_DAYS } from '../tasks/engine';
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

/** Live listeners by collection ('settings' for the settings document). */
const listeners = new Map<string, Unsubscribe>();
/** Collections whose latest snapshot came from the server, not only the local cache. */
const fromServer = new Set<CollectionName>();
export const confirmedByServer = (name: CollectionName) => fromServer.has(name);

/** Listeners that failed (and wait to resubscribe), with the reason. */
const failed = signal<ReadonlyMap<string, string>>(new Map());
/** Why the household's data is not coming in, while a listener waits to retry; null when all are live. */
export const loadError = computed(() => failed.value.values().next().value ?? null);
const setFailed = (key: string, reason: string | null) => {
  if (reason === null && !failed.value.has(key)) return;
  const next = new Map(failed.value);
  if (reason === null) next.delete(key);
  else next.set(key, reason);
  failed.value = next;
};
const LISTEN_RETRY_MS = 30_000;

function hid(): string {
  const h = householdId.value;
  if (!h) throw new Error('store: not signed in');
  return h;
}

export const colRef = (name: CollectionName) => collection(db, 'households', hid(), name);
export const docRef = (name: CollectionName, id: string) => doc(db, 'households', hid(), name, id);
const settingsRef = () => doc(db, 'households', hid(), 'settings', 'main');

/**
 * Keep one listener alive. Firestore ends a listener for good on an error
 * (permission denied, quota), which would leave the wall loading forever or
 * silently stale; it is reported and opened again after LISTEN_RETRY_MS.
 */
function listen(key: string, open: (onError: (e: FirestoreError) => void) => Unsubscribe): void {
  const household = householdId.value;
  const start = () => {
    listeners.set(
      key,
      open((e) => {
        console.warn(`store: ${key} listener failed`, e);
        setFailed(key, errorMessage(e));
        setTimeout(() => {
          if (householdId.value === household && listeners.has(key)) start();
        }, LISTEN_RETRY_MS);
      }),
    );
  };
  start();
}

/** Start listening to a household. Called by the session once signed in. */
export function openHousehold(id: string): void {
  closeHousehold();
  householdId.value = id;
  const pending = new Set<string>([...NAMES, 'settings']);
  const arrived = (name: string) => {
    setFailed(name, null);
    pending.delete(name);
    if (pending.size === 0) ready.value = true;
  };
  for (const name of NAMES) {
    listen(name, (onError) => {
      let q: Query = colRef(name);
      // Bounded history for the two collections that grow without limit. Task states reach as far
      // back as the task views do, plus a margin; the window moves on each listen.
      const since = toISODate(new Date(currentTime() - (HISTORY_DAYS + 2) * 86_400_000));
      if (name === 'taskStates') q = query(q, where('date', '>=', since));
      if (name === 'ledger') q = query(q, orderBy('at', 'desc'), limit(1000));
      return onSnapshot(
        q,
        (snap) => {
          if (snap.metadata.fromCache) fromServer.delete(name);
          else fromServer.add(name);
          data[name].value = snap.docs.map((d) => d.data()) as never;
          arrived(name);
        },
        onError,
      );
    });
  }
  listen('settings', (onError) =>
    onSnapshot(
      settingsRef(),
      (snap) => {
        settings.value = mergeSettings(snap.exists() ? snap.data() : {});
        arrived('settings');
      },
      onError,
    ),
  );
}

export function closeHousehold(): void {
  listeners.forEach((u) => u());
  listeners.clear();
  fromServer.clear();
  failed.value = new Map();
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

/**
 * Save what an editor shows: create the document when it is new, otherwise
 * update only `fields` (undefined deletes the field). Fields the editor does
 * not show (a redemption, a check-off, archived) are never overwritten, even
 * when a change made elsewhere has not reached this device yet.
 */
export function saveEdited<K extends CollectionName>(
  name: K,
  value: Collections[K],
  isNew: boolean,
  fields: readonly (keyof Collections[K] & string)[],
): Promise<void> {
  if (isNew) return put(name, value);
  const partial: Record<string, unknown> = {};
  for (const f of fields) partial[f] = value[f] === undefined ? deleteField() : value[f];
  return updateDoc(docRef(name, value.id), partial);
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
