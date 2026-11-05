import { describe, expect, it, vi } from 'vitest';
import type { CalEvent, CalendarInfo, CalendarSource } from '../../src/calendar/types';

/**
 * The wall's calendars belong to the household that is open. Disconnect,
 * then connect another Google account, and the last account's events must
 * not stay on the wall (nor come back from the offline snapshot after a
 * reload) until a fetch happens to replace them.
 */

const mem = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});
vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
vi.stubGlobal('window', { addEventListener: () => {} });

vi.mock('../../src/data/store', async () => {
  const { computed, signal } = await import('@preact/signals');
  const { DEFAULT_SETTINGS } = await import('../../src/data/settings');
  const data = { eventMeta: signal([]), profiles: signal([]) };
  return {
    data,
    settings: signal(DEFAULT_SETTINGS),
    householdId: signal<string | null>(null),
    profileById: computed(() => new Map()),
    put: async () => {},
    remove: async () => {},
  };
});

/** Each household's Google account has its own calendar with one event. */
const source = vi.hoisted(() => ({}) as CalendarSource);
vi.mock('../../src/calendar/google', () => ({ googleSource: source }));
// The wall's engine (a phone keeps no snapshot).
vi.mock('../../src/app/layout', () => ({ isPhone: false }));
vi.mock('../../src/data/session', () => ({ googleAccessToken: async () => 'token' }));

const store = await import('../../src/data/store');
const account = { hid: '' };
const cal = (hid: string): CalendarInfo => ({
  id: `${hid}@cal`,
  name: hid,
  color: '#123456',
  accessRole: 'owner',
  primary: true,
});
const event = (hid: string): CalEvent => {
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  return {
    key: `${hid}@cal::e`,
    calendarId: `${hid}@cal`,
    id: 'e',
    title: `${hid}'s event`,
    allDay: false,
    start,
    end: new Date(start.getTime() + 3_600_000),
    editable: true,
  };
};
let gate: Promise<void> = Promise.resolve();
source.listCalendars = async () => {
  await gate;
  return [cal(account.hid)];
};
source.listEvents = async (calendarId) => (calendarId === `${account.hid}@cal` ? [event(account.hid)] : []);
source.nextOccurrence = async () => null;

const titles = (events: CalEvent[]) => events.map((e) => e.title);

describe('calendar state per household', () => {
  it("drops the last household's events when another one opens, and does not load them back", async () => {
    const engine = await import('../../src/calendar/engine');
    account.hid = 'A';
    store.householdId.value = 'A';
    engine.startCalendarSync();
    await engine.refresh();
    expect(titles(engine.events.value)).toEqual(["A's event"]);

    // Disconnect, then connect the other account. Its first fetch is slow (or offline).
    store.householdId.value = null;
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    account.hid = 'B';
    store.householdId.value = 'B';
    expect(engine.events.value).toEqual([]);
    expect(engine.calendars.value).toEqual([]);
    open();
    await engine.refresh();
    expect(titles(engine.events.value)).toEqual(["B's event"]);

    // A reload while the next household cannot fetch yet: B's snapshot is not C's.
    vi.resetModules();
    gate = new Promise(() => {});
    const reloadedStore = await import('../../src/data/store');
    reloadedStore.householdId.value = 'C';
    const reloaded = await import('../../src/calendar/engine');
    reloaded.startCalendarSync();
    expect(reloaded.events.value).toEqual([]);
  });

  it('knows which days it has: none before a fetch or a snapshot, then the window it holds', async () => {
    vi.resetModules();
    mem.clear();
    account.hid = 'D';
    let open!: () => void;
    gate = new Promise((r) => (open = r));
    const st = await import('../../src/data/store');
    st.householdId.value = 'D';
    const engine = await import('../../src/calendar/engine');
    const { today } = await import('../../src/lib/clock');
    const { addDays, addMonths } = await import('../../src/lib/date');
    engine.startCalendarSync();
    // Nothing fetched yet: the days are not known to be empty.
    expect(engine.loadedRange.value).toBeNull();
    open();
    await engine.refresh();
    const t = today.value;
    const window = { from: addDays(t, -42), to: addMonths(t, 4) };
    expect(engine.loadedRange.value).toEqual(window);
    // Reopened while Google cannot be reached: the snapshot's days.
    vi.resetModules();
    gate = new Promise(() => {});
    const st2 = await import('../../src/data/store');
    st2.householdId.value = 'D';
    const reopened = await import('../../src/calendar/engine');
    reopened.startCalendarSync();
    expect(reopened.loadedRange.value).toEqual(window);
    expect(titles(reopened.events.value)).toEqual(["D's event"]);
  });
});
