import { computed, signal } from '@preact/signals';
import { getDocsFromServer, limit, orderBy, query, where } from 'firebase/firestore';
import { LEDGER_LIVE, colRef, data, householdId } from '../../data/store';
import type { LedgerEntry } from '../../data/types';

/** Profile whose star history sheet is open. */
export const historyFor = signal<string | null>(null);

/*
 * The store keeps only the newest LEDGER_LIVE entries of the household's
 * ledger live. Older ones are read a page at a time when the history sheet
 * asks for them; they are a copy, shown without Undo, and read afresh each
 * time a sheet opens (the live window moves on as entries are added).
 */
const PAGE = 500;
const NONE = { hid: null as string | null, entries: [] as LedgerEntry[], complete: false };
const older = signal(NONE);

export const openHistory = (profileId: string) => {
  older.value = NONE;
  historyFor.value = profileId;
};

const olderHere = computed(() => (older.value.hid === householdId.value ? older.value : null));

/** Entries older than the live window loaded so far. */
export const olderLedger = computed(() => olderHere.value?.entries ?? []);

/** The ledger has entries older than any loaded yet. */
export const moreLedger = computed(() => data.ledger.value.length >= LEDGER_LIVE && !olderHere.value?.complete);

let loading: Promise<void> | null = null;

/**
 * Read older ledger pages from the server (rejects offline) until
 * `profileId` has at least `want` more entries or the ledger has no more.
 * Pages go back by time across the household (no composite index needed);
 * entries tied at a page's last instant are read again and dropped as
 * duplicates.
 */
export function loadOlderLedger(profileId: string, want = 60): Promise<void> {
  loading ??= (async () => {
    const hid = householdId.value;
    let { entries, complete } = olderHere.value ?? { entries: [] as LedgerEntry[], complete: false };
    const seen = new Set([...data.ledger.value, ...entries].map((e) => e.id));
    let found = 0;
    while (!complete && found < want) {
      const oldest = [...data.ledger.value, ...entries].reduce((m, e) => Math.min(m, e.at), Infinity);
      const page = query(colRef('ledger'), where('at', '<=', oldest), orderBy('at', 'desc'), limit(PAGE));
      const snap = await getDocsFromServer(page);
      if (householdId.value !== hid) return;
      const fresh = snap.docs.map((d) => d.data() as LedgerEntry).filter((e) => !seen.has(e.id));
      fresh.forEach((e) => seen.add(e.id));
      entries = [...entries, ...fresh];
      found += fresh.filter((e) => e.profileId === profileId).length;
      complete = snap.size < PAGE || fresh.length === 0;
      older.value = { hid, entries, complete };
    }
  })().finally(() => (loading = null));
  return loading;
}
