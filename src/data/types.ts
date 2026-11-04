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
export const PARTS_OF_DAY: PartOfDay[] = ['morning', 'afternoon', 'evening'];

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

export interface Message {
  id: string;
  text: string;
  /** Profile who wrote it, if chosen. */
  from?: string;
  createdAt: number;
  dismissedAt?: number;
}

/**
 * App-side data for a Google event, keyed by eventMetaKey(). Series-level
 * entries use the recurring event id; instance entries override them.
 */
export interface EventMeta {
  id: string;
  /** Assigned profiles; [EVERYONE] for the whole family. Absent entry = unassigned (triage). */
  profiles: string[];
  countdown?: boolean;
  emoji?: string;
  updatedAt: number;
}

export const EVERYONE = '*';

export type TabId = 'home' | 'calendar' | 'lists' | 'tasks' | 'rewards' | 'meals' | 'recipes';
export type CalendarView = 'schedule' | 'day' | 'week' | 'month';

export interface TimeWindow {
  enabled: boolean;
  from: HHMM;
  to: HHMM;
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
  mealCategories: MealCategory[];
  // Weather
  weather: { lat: number; lon: number; name: string } | null;
  tempUnit: 'f' | 'c';
  // Display
  hiddenTabs: TabId[];
  textScale: 'small' | 'medium' | 'large';
  night: TimeWindow;
  sleep: TimeWindow;
  /** Return to Home after this many idle minutes (0 = never). */
  idleHomeMinutes: number;
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
}
