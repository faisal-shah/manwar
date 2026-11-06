/**
 * Household data model. Everything lives under households/{hid}/<collection>
 * in Firestore; calendar events themselves live in Google Calendar and are
 * joined with EventMeta by key.
 *
 * Dates without times are local ISO dates ('2026-11-04'); times of day are
 * 'HH:mm'; instants are epoch milliseconds.
 */

export type ISODate = string;
export type HHMM = string;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Profile {
  id: string;
  name: string;
  /** Hex color, e.g. '#2D7F86'. */
  color: string;
  /** Optional emoji shown in place of the initial. */
  emoji?: string;
  order: number;
  /** Star balance; kept equal to the sum of this profile's ledger deltas. */
  stars: number;
  birthday?: ISODate;
  createdAt: number;
}

export type PartOfDay = 'morning' | 'afternoon' | 'evening';
export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

/** A calendar-style repeat rule shared by chores, routines, meals and events. */
export interface Repeat {
  every: number;
  unit: RepeatUnit;
  /** For unit 'week': which weekdays. Defaults to the start date's weekday. */
  weekdays?: Weekday[];
  /** Last date (inclusive) an occurrence may fall on. */
  until?: ISODate;
}

export type TaskKind = 'chore' | 'routine';

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  emoji?: string;
  notes?: string;
  /** Profiles this task belongs to; each gets its own occurrence. Empty for Up for Grabs. */
  assignees: string[];
  /** Chores only: anyone may claim it; the first to complete it gets the stars. */
  upForGrabs: boolean;
  /** Stars awarded per completed occurrence (0 = none). */
  stars: number;
  /** First (or only) date. */
  date: ISODate;
  /** Chores: optional due time. */
  time?: HHMM;
  /** Scheduled repeat. Routines always have one (daily or weekly). */
  repeat?: Repeat;
  /** Chores: repeat N units after each completion instead of on a schedule. */
  repeatAfterDone?: { every: number; unit: 'day' | 'week' | 'month' };
  /** Routines: the parts of the day it appears in (one occurrence per part). */
  parts?: PartOfDay[];
  /** Sort key within its section. */
  order: number;
  createdAt: number;
  archived?: boolean;
  /** Repeat-after-done chores: last completion date per lastDoneKey(profileId). */
  lastDone?: Record<string, ISODate>;
}

/** Field key for Task.lastDone ('any' for Up for Grabs, since '*' is not a valid field path). */
export const lastDoneKey = (profileId: string) => (profileId === '*' ? 'any' : profileId);

/** Stored state of one occurrence. Absent = not done. */
export interface TaskState {
  /** taskStateId(taskId, date, part, profileId) */
  id: string;
  taskId: string;
  date: ISODate;
  part: PartOfDay | null;
  /** Assignee, or UP_FOR_GRABS for an unassigned chore. */
  profileId: string;
  /** Who completed it (the claimer for Up for Grabs). */
  by: string;
  status: 'done' | 'skipped';
  at: number;
  /** Stars posted to the ledger for this completion. */
  stars: number;
  /** Ledger entry that awarded the stars, if any. */
  ledgerId?: string;
}

export const UP_FOR_GRABS = '*';

export type LedgerReason = 'task' | 'untask' | 'give' | 'remove' | 'redeem' | 'unredeem' | 'undo';

/** Append-only star history. A profile's balance is the sum of its deltas. */
export interface LedgerEntry {
  id: string;
  profileId: string;
  delta: number;
  reason: LedgerReason;
  /** Task, reward or ledger id the entry refers to. */
  ref?: string;
  /** Human label at the time of the entry ("Breakfast", "Movie night"). */
  label: string;
  note?: string;
  at: number;
  /** Set on an entry that a later 'undo' entry reversed. */
  undoneAt?: number;
}

export interface Reward {
  id: string;
  title: string;
  emoji?: string;
  cost: number;
  /** Profiles who can redeem it; empty = everyone. */
  profiles: string[];
  /** Renewing rewards stay available after each redemption. */
  renews: boolean;
  /** Non-renewing rewards: who has redeemed it, and when. */
  redeemedBy: Record<string, number>;
  order: number;
  createdAt: number;
  archived?: boolean;
}

export type ListKind = 'grocery' | 'todo' | 'other';

export interface ListSection {
  id: string;
  name: string;
}

export interface List {
  id: string;
  title: string;
  kind: ListKind;
  emoji?: string;
  color?: string;
  sections: ListSection[];
  /** The list recipe ingredients are added to. Exactly one list has it. */
  isDefaultGrocery?: boolean;
  order: number;
  createdAt: number;
}

/**
 * An item the household has put on a grocery list (`groceryMemory`, one
 * per itemKey, shared by every grocery list): what Add item suggests.
 */
export interface GroceryMemory {
  /** memoryId(key): a hash of the key (lists/logic.ts). */
  id: string;
  /** itemKey(text). */
  key: string;
  /** As last added (without a quantity). */
  text: string;
  /** Times added. */
  count: number;
  lastAt: number;
}

export interface ListItem {
  id: string;
  listId: string;
  sectionId?: string;
  text: string;
  qty?: string;
  done: boolean;
  doneAt?: number;
  order: number;
  createdAt: number;
}

export type MealCategoryId = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealCategory {
  id: MealCategoryId;
  name: string;
  color: string;
  visible: boolean;
  showOnCalendar: boolean;
}

export interface MealEntry {
  id: string;
  date: ISODate;
  category: MealCategoryId;
  recipeId?: string;
  /** Copied from the recipe at planning time, or typed for a one-off. */
  title: string;
  notes?: string;
  repeat?: Repeat;
  order: number;
  createdAt: number;
}

export interface Recipe {
  id: string;
  name: string;
  category: MealCategoryId;
  emoji?: string;
  /** One ingredient per line ("2 cups flour"). */
  ingredients: string[];
  instructions: string;
  servings?: number;
  sourceUrl?: string;
  createdAt: number;
}

/** A paired phone (`devices`): added and removed by the Functions (see firestore.rules). */
export interface Device {
  id: string;
  name: string;
  kind: 'phone';
  createdAt: number;
  /** When the phone was last used (opened, shown again, touched); it stamps this itself, at most hourly. */
  lastSeenAt?: number;
}

/**
 * A timer run, shared so a phone can start, watch or stop it: a wall's own
 * in `timers/<that tablet's id>`, a phone's in `timers/wall`
 * (features/timer/state.ts).
 */
export interface WallTimer {
  id: string;
  /** This run of the timer: every start is a new run, written over the last in its document. */
  run: string;
  minutes: number;
  /** End of the "3, 2, 1" lead-in; the timer runs from here. */
  startAt: number;
  endAt: number;
  /** The phone that started it, when one did (Device id). */
  startedBy?: string;
  /**
   * When runs were stopped or dismissed, by run id (the document stays, so
   * the wall knows when sleep may resume). Only the document's own run
   * counts: a stop that lands late, meant for an earlier run, stops nothing.
   */
  stopped?: Record<string, number>;
}

/** A request for the wall's screen from a phone (`commands/display`): sleep now, or wake up. */
export interface DisplayCommand {
  id: 'display';
  kind: 'sleep' | 'wake';
  /** New for every command: a wall applies each one once, whatever the clocks say. */
  nonce: string;
  /** When it was sent (the phone's clock); a wall ignores one older than a few minutes. */
  at: number;
  by?: string;
}

export interface Message {
  id: string;
  text: string;
  /** Profile who wrote it, if chosen. */
  from?: string;
  createdAt: number;
  dismissedAt?: number;
  /** Speak the text (Web Speech) when it first appears on the wall. */
  readAloud?: boolean;
}

/**
 * App-side data for a Google event, keyed by eventMetaKey(). Series-level
 * entries use the recurring event id; instance entries override them.
 */
export interface EventMeta {
  id: string;
  /**
   * Assigned profiles; [EVERYONE] for the whole family. Absent entry =
   * unassigned (triage). An occurrence's own document with [] follows its
   * series; [NOBODY] is assigned to no one, whatever the series has.
   */
  profiles: string[];
  countdown?: boolean;
  emoji?: string;
  updatedAt: number;
}

export const EVERYONE = '*';
/**
 * Event profiles meaning "no one": an occurrence whose people were taken
 * away (their profile deleted) waits in triage
 * instead of falling back to its series' people. Never a profile id, so
 * the views skip it like a deleted profile.
 */
export const NOBODY = '-';

export type TabId = 'home' | 'calendar' | 'lists' | 'tasks' | 'rewards' | 'meals' | 'recipes';
export type CalendarView = 'schedule' | 'day' | 'week' | 'month';
/** Home's optional side panes (the calendar pane is always shown). */
export type HomePane = 'tasks' | 'lists';

export interface TimeWindow {
  enabled: boolean;
  from: HHMM;
  to: HHMM;
}

/** A change as a merge applies it: nested maps merge field by field, a list is replaced whole. */
type Patch<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: Patch<T[K]> } : T;
/** A change to the settings document (saveSettings). */
export type SettingsPatch = Patch<Settings>;

/**
 * Where the family lives (Settings > Location; a phone sets it in More >
 * Prayer times): the weather and the prayer times are for this place.
 * Written whole, so two devices choosing places never mix their fields.
 */
export interface Place {
  /** "Houston, Texas" */
  name: string;
  lat: number;
  lon: number;
  /** IANA zone (America/Chicago): the prayer clock keeps the place's calendar day. */
  timezone: string;
}

/** Household settings: one document, settings/main. */
export interface Settings {
  // Calendar
  weekStart: 0 | 1;
  scheduleDays: number;
  scheduleStartToday: boolean;
  monthStartCurrentWeek: boolean;
  weekStartToday: boolean;
  dimPast: boolean;
  shadeWeekends: boolean;
  stripeMultiProfile: boolean;
  countdownWindow: 'always' | '3m' | '1m';
  timeFormat: '12h' | '24h';
  /** Google calendars shown on the wall, by calendar id. Missing = shown. */
  hiddenCalendars: string[];
  /** Where events created on the tablet go. Defaults to the primary calendar. */
  defaultCalendarId?: string;
  /** Color for events assigned to Everyone. */
  familyColor: string;
  // Filter (Calendar tab)
  filter: {
    taskProgress: boolean;
    countdowns: boolean;
    weather: boolean;
    meals: boolean;
    hiddenProfiles: string[];
  };
  // Meals
  /**
   * The four categories by id (a map, so each tablet's change is a field
   * write that keeps another's); shown in DEFAULT_MEAL_CATEGORIES order.
   */
  mealCategories: Record<MealCategoryId, MealCategory>;
  // Location
  place: Place | null;
  tempUnit: 'f' | 'c';
  // Display
  hiddenTabs: TabId[];
  /** Home panes turned off with Customize. */
  homeHiddenPanes: HomePane[];
  textScale: 'small' | 'medium' | 'large';
  night: TimeWindow;
  sleep: TimeWindow;
  /** Return to Home after this many idle minutes (0 = never). */
  idleHomeMinutes: number;
  /** The wall's face after a few minutes without a touch, and at night (app/face.ts). */
  restingFace: 'family' | 'prayer';
  // Parental lock
  lock: {
    /** SHA-256 of salt + PIN; absent = lock off. */
    pinHash?: string;
    salt?: string;
    relockMinutes: number;
  };
  // Tasks
  /** Show every part of the day, not just the current one. */
  tasksShowAllParts: boolean;
  sounds: boolean;
  /** When the household got its first-run data. A household is seeded once, ever: only while this is unset. */
  seededAt?: number;
  /** When the grocery suggestions' memory was started from the lists (features/lists/memory.ts). */
  groceryMemorySince?: number;
}
