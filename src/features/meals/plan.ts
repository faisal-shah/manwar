import type { ISODate, MealCategoryId, MealEntry, Repeat, Weekday } from '../../data/types';
import { addDays, diffDays, fromISODate, monthShort, startOfWeek } from '../../lib/date';
import { occursOn } from '../../lib/repeat';

/**
 * Pure meal-plan logic: the week window, which entries fall on which days
 * (repeating entries appear on every matching date), and splitting a
 * repeating entry when one day or the rest of the series changes.
 *
 * The grid shows a calendar week starting on settings.weekStart, not "the
 * next seven days". Skylight's help text says next seven days, but every
 * device capture from 2024 to Oct 2026 (research/04 Meals) shows a week
 * aligned to the week start with past days kept, and the paging control
 * reads "This week". A fixed week also keeps a day in the same column all
 * week, which is what a wall display glanced at in passing needs.
 */

export interface MealOccurrence {
  entry: MealEntry;
  date: ISODate;
}

export const weekOf = (day: ISODate, weekStart: 0 | 1, offsetWeeks = 0): ISODate =>
  addDays(startOfWeek(day, weekStart), offsetWeeks * 7);

export const weekDays = (start: ISODate): ISODate[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** "Nov 8 - 14", "Nov 29 - Dec 5", with the year when it is not `thisYear`. */
export function formatWeekRange(start: ISODate, thisYear: number): string {
  const a = fromISODate(start);
  const b = fromISODate(addDays(start, 6));
  const left = `${monthShort(a.getMonth())} ${a.getDate()}`;
  const right = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${monthShort(b.getMonth())} ${b.getDate()}`;
  const year = b.getFullYear() !== thisYear ? `, ${b.getFullYear()}` : '';
  return `${left} - ${right}${year}`;
}

const byCellOrder = (a: MealEntry, b: MealEntry) => a.order - b.order || a.createdAt - b.createdAt;

/** Every (entry, date) in [from, to], by date then cell order. */
export function mealOccurrences(entries: MealEntry[], from: ISODate, to: ISODate): MealOccurrence[] {
  const out: MealOccurrence[] = [];
  for (const entry of entries) {
    if (!entry.repeat) {
      if (entry.date >= from && entry.date <= to) out.push({ entry, date: entry.date });
      continue;
    }
    for (let d = entry.date > from ? entry.date : from; d <= to; d = addDays(d, 1))
      if (occursOn(entry.repeat, entry.date, d)) out.push({ entry, date: d });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byCellOrder(a.entry, b.entry)));
}

export const cellKey = (date: ISODate, category: MealCategoryId) => `${date}|${category}`;

/** Occurrences grouped by cellKey(date, category), each cell in order. */
export function byCell(occ: MealOccurrence[]): Map<string, MealEntry[]> {
  const m = new Map<string, MealEntry[]>();
  for (const o of occ) {
    const k = cellKey(o.date, o.entry.category);
    const list = m.get(k);
    if (list) list.push(o.entry);
    else m.set(k, [o.entry]);
  }
  return m;
}

/** Order value that puts a new entry after the others in its cell. */
export function nextCellOrder(entries: MealEntry[], date: ISODate, category: MealCategoryId): number {
  const inCell = mealOccurrences(entries, date, date).filter((o) => o.entry.category === category);
  return inCell.length ? Math.max(...inCell.map((o) => o.entry.order)) + 1 : 0;
}

/** First occurrence strictly after `date`, looking ahead at most `maxDays`. */
export function nextOccurrenceAfter(entry: MealEntry, date: ISODate, maxDays = 800): ISODate | null {
  if (!entry.repeat) return null;
  for (let i = 1, d = addDays(date, 1); i <= maxDays; i++, d = addDays(d, 1)) {
    if (entry.repeat.until && d > entry.repeat.until) return null;
    if (occursOn(entry.repeat, entry.date, d)) return d;
  }
  return null;
}

export type Scope = 'one' | 'following' | 'all';

export type MealOp =
  { op: 'put'; entry: MealEntry } | { op: 'patch'; id: string; data: Partial<MealEntry> } | { op: 'remove'; id: string };

/** A weekly rule moved by `days`: its weekdays move with it (other rules follow their start date). */
function shiftRepeat(rule: Repeat, days: number): Repeat {
  if (rule.unit !== 'week' || !rule.weekdays?.length) return rule;
  return { ...rule, weekdays: rule.weekdays.map((d) => ((((d + days) % 7) + 7) % 7) as Weekday).sort() };
}

/**
 * Writes that change (or, with `changes` null, remove) the occurrence of
 * `entry` on `date`. The entry itself is only ever patched with the fields
 * that change (undefined removes one), never rewritten whole, so a change
 * made meanwhile on another device to a field this edit does not touch is
 * kept. A one-off entry ignores `scope`. For a repeating entry:
 * 'all' edits the series itself; 'following' ends the series the day before
 * and starts a new one with the changes; 'one' ends it the day before, adds
 * a one-off with the changes, and continues the series from its next
 * occurrence. `newId` mints ids for the entries this creates.
 *
 * Moving the occurrence to another day (`changes.date`) moves the series
 * with it: 'all' shifts every occurrence by the same number of days,
 * 'following' starts the new series there, and a weekly rule's weekdays
 * shift too, so the moved meal is on the day it was moved to. A repeat in
 * `changes` is taken as given.
 */
export function editOccurrence(
  entry: MealEntry,
  date: ISODate,
  scope: Scope,
  changes: Partial<Omit<MealEntry, 'id'>> | null,
  newId: () => string,
): MealOp[] {
  if (changes && entry.repeat && scope !== 'one') {
    const moved = changes.date && changes.date !== date ? diffDays(date, changes.date) : 0;
    const repeat = 'repeat' in changes ? changes.repeat : shiftRepeat(entry.repeat, moved);
    // 'all' keeps the series start (shifted); a repeat turned off leaves one meal on the day being edited.
    const start = scope === 'following' ? (changes.date ?? date) : repeat ? addDays(entry.date, moved) : (changes.date ?? date);
    changes = { ...changes, date: start, repeat };
  }
  if (!entry.repeat || scope === 'all') {
    if (!changes) return [{ op: 'remove', id: entry.id }];
    return [{ op: 'patch', id: entry.id, data: changes }];
  }
  const ops: MealOp[] = [];
  const isFirst = date <= entry.date;
  const endBefore = (): MealOp =>
    isFirst
      ? { op: 'remove', id: entry.id }
      : { op: 'patch', id: entry.id, data: { repeat: { ...entry.repeat!, until: addDays(date, -1) } } };

  if (scope === 'following') {
    if (isFirst && changes) return [{ op: 'patch', id: entry.id, data: { date, ...changes } }];
    ops.push(endBefore());
    if (changes) ops.push({ op: 'put', entry: { ...entry, date, ...changes, id: newId() } });
    return ops;
  }

  // scope 'one'
  const next = nextOccurrenceAfter(entry, date);
  if (isFirst && next) ops.push({ op: 'patch', id: entry.id, data: { date: next } });
  else {
    ops.push(endBefore());
    if (next) ops.push({ op: 'put', entry: { ...entry, id: newId(), date: next } });
  }
  if (changes) {
    const { repeat: _ignored, ...rest } = { ...entry, date, ...changes };
    ops.push({ op: 'put', entry: { ...rest, id: newId() } });
  }
  return ops;
}

/**
 * The writes that undo `ops` (from editOccurrence on `entry`): the entries
 * they created go, a removed entry comes back, and a patched one gets back
 * only the fields the patch changed, so a change made since to anything
 * else is kept.
 */
export function undoOps(entry: MealEntry, ops: MealOp[]): MealOp[] {
  return ops.map((o): MealOp => {
    if (o.op === 'put') return { op: 'remove', id: o.entry.id };
    if (o.op === 'remove') return { op: 'put', entry };
    const was = Object.fromEntries(Object.keys(o.data).map((k) => [k, entry[k as keyof MealEntry]]));
    return { op: 'patch', id: o.id, data: was as Partial<MealEntry> };
  });
}
