import { batch as signalBatch, computed, effect, signal, type Signal } from '@preact/signals';
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  onSnapshotsInSync,
  orderBy,
  query,
  runTransaction,
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
import { isPhone } from '../app/layout';
import { errorMessage } from './errors';
import { db } from './firebase';
import { addDays } from '../lib/date';
import { currentTime, today } from '../lib/clock';
import { toISODate } from '../lib/date';
import { HISTORY_DAYS } from '../tasks/engine';
import { DEFAULT_SETTINGS, mergeSettings } from './settings';
import type {
  Device,
  DisplayCommand,
  GroceryMemory,
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
  SettingsPatch,
  Task,
  TaskState,
  WallTimer,
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
  devices: Device;
  timers: WallTimer;
  commands: DisplayCommand;
  groceryMemory: GroceryMemory;
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
  'devices',
  'timers',
  'commands',
  'groceryMemory',
];

/** Live contents of each collection, updated by Firestore snapshots (local writes show immediately). */
export const data = Object.fromEntries(NAMES.map((n) => [n, signal<unknown[]>([])])) as {
  [K in CollectionName]: Signal<Collections[K][]>;
};

export const settings = signal<Settings>(DEFAULT_SETTINGS);

/**
 * The prayer clock's settings document (`settings/prayer`) as stored, {}
 * while there is none. `prayer/settingsStore.ts` parses it: it is outside
 * input to the clock (another version of the app, a hand edit).
 */
export const prayerSettingsDoc = signal<Record<string, unknown>>({});

/** Household id of the signed-in tablet, null until signed in. */
export const householdId = signal<string | null>(null);

/**
 * True once every collection has delivered its first snapshot. A phone keeps
 * the household in memory only (data/firebase.ts), so a snapshot from its
 * cache at first is no more than "nothing yet": on a phone a collection
 * counts once the server has answered for it, and a phone that cannot reach
 * the server keeps loading instead of showing an empty household as real.
 */
export const ready = signal(false);

/**
 * True once the settings document has been read: from the cache, or the
 * server's answer that there is none. A cache without it (a cold start, the
 * demo's memory cache) says nothing yet, and `settings` are only the defaults.
 */
export const settingsLoaded = signal(false);

export const profiles = computed(() => [...data.profiles.value].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt));
export const profileById = computed(() => new Map(profiles.value.map((p) => [p.id, p])));

/**
 * The ledger listener holds the household's newest entries, up to this many;
 * the star history sheet pages further back with loadOlderLedger.
 */
export const LEDGER_LIVE = 1000;

/**
 * Open subscriptions by listener (a collection, or 'settings' for the
 * settings document); more than one only while a new one replaces another.
 */
const listeners = new Map<string, Set<Unsubscribe>>();
/** Collections (and 'settings') whose latest snapshot came from the server, not only the local cache. */
const fromServer = new Set<CollectionName | 'settings'>();
export const confirmedByServer = (name: CollectionName | 'settings') => fromServer.has(name);
const noteSource = (name: CollectionName | 'settings', fromCache: boolean) => {
  if (fromCache) fromServer.delete(name);
  else fromServer.add(name);
};

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
/** Counts closed households, so a retry scheduled for one that closed (even if reopened since) does nothing. */
let generation = 0;

function hid(): string {
  const h = householdId.value;
  if (!h) throw new Error('store: not signed in');
  return h;
}

export const colRef = (name: CollectionName) => collection(db, 'households', hid(), name);
export const docRef = (name: CollectionName, id: string) => doc(db, 'households', hid(), name, id);
export const settingsRef = () => doc(db, 'households', hid(), 'settings', 'main');
export const prayerSettingsRef = () => doc(db, 'households', hid(), 'settings', 'prayer');

/**
 * Opens one subscription. Its snapshot handler starts with `current()`,
 * which is false for a subscription another has replaced: that snapshot is
 * dropped.
 */
type Open = (current: () => boolean, onError: (e: FirestoreError) => void) => Unsubscribe;

/**
 * Keep one listener alive. Firestore ends a listener for good on an error
 * (permission denied, quota), which would leave the wall loading forever or
 * silently stale; it is reported and opened again after LISTEN_RETRY_MS.
 * The returned function opens it again with a fresh query (the task
 * states' window moves at the day change): the old subscription stays until
 * the new one delivers, so the store never shows less in between, and the
 * new one's first snapshot is whole (the cache holds what the old one had).
 */
function listen(key: string, open: Open): () => void {
  const gen = generation;
  const subs = new Set<Unsubscribe>();
  listeners.set(key, subs);
  let latest = 0;
  const start = () => {
    const n = ++latest;
    /** The subscriptions this one replaces once it delivers. */
    let replaces = [...subs];
    let live = true;
    const close = () => {
      live = false;
      unsubscribe();
      subs.delete(close);
    };
    const unsubscribe = open(
      () => {
        if (!live) return false;
        replaces.forEach((u) => u());
        replaces = [];
        return true;
      },
      (e) => {
        close();
        console.warn(`store: ${key} listener failed`, e);
        setFailed(key, errorMessage(e));
        setTimeout(() => {
          if (generation === gen && n === latest) start();
        }, LISTEN_RETRY_MS);
      },
    );
    subs.add(close);
  };
  start();
  return () => {
    if (generation === gen) start();
  };
}

/** Stops following the day for the open household's task states query. */
let stopDayWatch: (() => void) | null = null;

/** Start listening to a household. Called by the session once signed in. */
export function openHousehold(id: string): void {
  closeHousehold();
  householdId.value = id;
  const pending = new Set<string>([...NAMES, 'settings', 'prayer']);
  const arrived = (name: string) => {
    setFailed(name, null);
    pending.delete(name);
    if (pending.size === 0) ready.value = true;
  };
  const reopen = new Map<CollectionName, () => void>();
  for (const name of NAMES) {
    const again = listen(name, (current, onError) => {
      let q: Query = colRef(name);
      // Bounded history for the two collections that grow without limit. Task states reach as far
      // back as the task views do, plus a margin, from the day the query opens.
      const since = addDays(today.peek(), -(HISTORY_DAYS + 2));
      if (name === 'taskStates') q = query(q, where('date', '>=', since));
      if (name === 'ledger') q = query(q, orderBy('at', 'desc'), limit(LEDGER_LIVE));
      let first = true;
      return onSnapshot(
        q,
        // A phone needs to hear that the server answered even when its answer changes nothing (an empty collection).
        { includeMetadataChanges: isPhone },
        (snap) => {
          if (!current()) return;
          noteSource(name, snap.metadata.fromCache);
          // A snapshot that only says where it came from leaves the data as it is.
          if (first || snap.docChanges().length) data[name].value = snap.docs.map((d) => d.data()) as never;
          first = false;
          if (!(isPhone && snap.metadata.fromCache)) arrived(name);
        },
        onError,
      );
    });
    reopen.set(name, again);
  }
  listen('settings', (current, onError) =>
    onSnapshot(
      settingsRef(),
      { includeMetadataChanges: isPhone },
      (snap) => {
        if (!current()) return;
        noteSource('settings', snap.metadata.fromCache);
        const next = mergeSettings(snap.exists() ? snap.data() : {});
        if (JSON.stringify(next) !== JSON.stringify(settings.peek())) settings.value = next;
        if (snap.exists() || !snap.metadata.fromCache) settingsLoaded.value = true;
        if (!(isPhone && snap.metadata.fromCache)) arrived('settings');
      },
      onError,
    ),
  );
  listen('prayer', (current, onError) =>
    onSnapshot(
      prayerSettingsRef(),
      { includeMetadataChanges: isPhone },
      (snap) => {
        if (!current()) return;
        const next = snap.exists() ? snap.data() : {};
        if (JSON.stringify(next) !== JSON.stringify(prayerSettingsDoc.peek())) prayerSettingsDoc.value = next;
        if (!(isPhone && snap.metadata.fromCache)) arrived('prayer');
      },
      onError,
    ),
  );
  // The task states' window moves with today, so a wall that runs for weeks does not hold a growing history.
  let day = today.peek();
  stopDayWatch = effect(() => {
    const next = today.value;
    if (next === day) return;
    day = next;
    reopen.get('taskStates')!();
  });
}

export function closeHousehold(): void {
  generation++;
  stopDayWatch?.();
  stopDayWatch = null;
  listeners.forEach((subs) => [...subs].forEach((u) => u()));
  listeners.clear();
  fromServer.clear();
  failed.value = new Map();
  unsentWrites.value = 0;
  signalBatch(() => {
    for (const name of NAMES) data[name].value = [];
    settings.value = DEFAULT_SETTINGS;
    prayerSettingsDoc.value = {};
    settingsLoaded.value = false;
    ready.value = false;
    householdId.value = null;
  });
}

/**
 * Call `done` once the store shows every write made so far to `names`: each
 * listener has seen it (snapshots in sync) and none of `names` is down. A
 * listener that failed sees no writes until it is opened again, and
 * Firestore's in-sync event does not wait for it; a write guard released
 * then would let the next tap decide from data that never showed the first.
 * Other listeners being down does not hold it: they show nothing the write
 * guard decides from.
 */
export function whenShown(names: readonly CollectionName[], done: () => void): void {
  const down = (f: ReadonlyMap<string, string>) => names.some((n) => f.has(n));
  const stop = onSnapshotsInSync(db, () => {
    stop();
    if (!down(failed.peek())) return done();
    let finished = false;
    const off = failed.subscribe((f) => {
      if (down(f) || finished) return;
      finished = true;
      off();
      done();
    });
  });
}

export const newId = () => doc(collection(db, '_ids')).id;

/*
 * Writes. They apply to the local cache at once (snapshots fire
 * immediately) and sync when online, so callers do not await them for UI.
 * Each one's promise settles when the server has taken (or refused) it.
 */

/**
 * Writes made here that the server has not answered yet: queued while
 * offline. A phone keeps them in memory only, so it says so while there
 * are any (they are lost if the browser closes the page first).
 */
export const unsentWrites = signal(0);
function sent(p: Promise<void>): Promise<void> {
  const gen = generation;
  unsentWrites.value++;
  const done = () => {
    if (generation === gen) unsentWrites.value--;
  };
  p.then(done, done);
  return p;
}

export function put<K extends CollectionName>(name: K, value: Collections[K]): Promise<void> {
  return sent(setDoc(docRef(name, value.id), value as object));
}

export function patch<K extends CollectionName>(name: K, id: string, partial: Partial<Collections[K]>): Promise<void> {
  return sent(updateDoc(docRef(name, id), partial as object));
}

/** `partial` as a field-by-field change: an undefined value deletes the field (plain writes skip it). */
export function fieldChanges(partial: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(partial).map(([k, v]) => [k, v === undefined ? deleteField() : v]));
}

/**
 * Write only the fields in `partial` (undefined deletes one), creating the
 * document when it does not exist. For documents more than one device may
 * change at once: fields this write does not name are kept.
 */
export function upsert<K extends CollectionName>(name: K, id: string, partial: Partial<Collections[K]>): Promise<void> {
  return sent(setDoc(docRef(name, id), fieldChanges(partial), { merge: true }));
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
  return sent(updateDoc(docRef(name, value.id), fieldChanges(Object.fromEntries(fields.map((f) => [f, value[f]])))));
}

export function remove(name: CollectionName, id: string): Promise<void> {
  return sent(deleteDoc(docRef(name, id)));
}

/**
 * Merge `changes` (a nested partial: only the fields that changed) into the
 * prayer clock's settings document, so another device's change to the
 * other fields is kept.
 */
export function savePrayerSettings(changes: Record<string, unknown>): Promise<void> {
  return sent(setDoc(prayerSettingsRef(), changes, { merge: true }));
}

/**
 * Merge `partial` into the settings document. Name only what changed: a
 * nested map is merged, so `{ filter: { weather: false } }` keeps another
 * tablet's change to the other filters, while a list is written whole, so
 * one element goes in or out with listAdd / listRemove (data/settings.ts).
 */
export function saveSettings(partial: SettingsPatch): Promise<void> {
  return sent(setDoc(settingsRef(), partial, { merge: true }));
}

/** The reads and writes of a transaction. */
export interface Tx {
  get<K extends CollectionName>(name: K, id: string): Promise<Collections[K] | undefined>;
  put<K extends CollectionName>(name: K, value: Collections[K]): void;
  patch<K extends CollectionName>(name: K, id: string, partial: Partial<Collections[K]>): void;
}

/**
 * One retry, for a write by another device in between. Firestore's default
 * (five, backing off) keeps a person offline waiting about eight seconds to
 * hear that the server is out of reach.
 */
const TRANSACTION_ATTEMPTS = 2;

/**
 * Read and write on the server, for a decision this device must not make
 * from its own copy (a phone acting on the wall). Unlike the writes above
 * it does not queue: it fails (Firestore code 'unavailable') when the
 * server cannot be reached, and runs `fn` again when another device
 * changed what it read before it could write. The result shows here once
 * the listeners deliver it.
 */
export function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runTransaction(
    db,
    (t) =>
      fn({
        get: async (name, id) => (await t.get(docRef(name, id))).data() as never,
        put: (name, value) => void t.set(docRef(name, value.id), value as object),
        patch: (name, id, partial) => void t.update(docRef(name, id), partial as object),
      }),
    { maxAttempts: TRANSACTION_ATTEMPTS },
  );
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
    /** Write only the fields in `partial`, creating the document when it does not exist (as upsert does). */
    upsert<K extends CollectionName>(name: K, id: string, partial: Partial<Collections[K]>) {
      b.set(docRef(name, id), fieldChanges(partial), { merge: true });
      return api;
    },
    remove(name: CollectionName, id: string) {
      b.delete(docRef(name, id));
      return api;
    },
    /** Merge into the settings document, as saveSettings does. */
    settings(partial: SettingsPatch) {
      b.set(settingsRef(), partial, { merge: true });
      return api;
    },
    /** Merge into the prayer clock's settings document, as savePrayerSettings does. */
    prayerSettings(changes: Record<string, unknown>) {
      b.set(prayerSettingsRef(), changes, { merge: true });
      return api;
    },
    /** Adjust a profile's star balance by delta. */
    stars(profileId: string, delta: number) {
      b.update(docRef('profiles', profileId) as DocumentReference, { stars: increment(delta) });
      return api;
    },
    commit: () => sent(b.commit()),
  };
  return api;
}

export const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((x) => [x.id, x]));

/** ISO date `n` days from today, for queries and seeds. */
export const daysFromToday = (n: number) => addDays(toISODate(new Date(currentTime())), n);
