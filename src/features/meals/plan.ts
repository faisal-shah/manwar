import type { ISODate, MealCategoryId, MealEntry } from '../../data/types';
import { addDays, fromISODate, monthShort, startOfWeek } from '../../lib/date';
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

/**
 * Writes that change (or, with `changes` null, remove) the occurrence of
 * `entry` on `date`. A one-off entry ignores `scope`. For a repeating entry:
 * 'all' edits the series itself; 'following' ends the series the day before
 * and starts a new one with the changes; 'one' ends it the day before, adds
 * a one-off with the changes, and continues the series from its next
 * occurrence. `newId` mints ids for the entries this creates.
 */
export function editOccurrence(
  entry: MealEntry,
  date: ISODate,
  scope: Scope,
  changes: Partial<Omit<MealEntry, 'id'>> | null,
  newId: () => string,
): MealOp[] {
  if (!entry.repeat || scope === 'all') {
    if (!changes) return [{ op: 'remove', id: entry.id }];
    return [{ op: 'put', entry: { ...entry, ...changes } }];
  }
  const ops: MealOp[] = [];
  const isFirst = date <= entry.date;
  const endBefore = (): MealOp =>
    isFirst
      ? { op: 'remove', id: entry.id }
      : { op: 'patch', id: entry.id, data: { repeat: { ...entry.repeat!, until: addDays(date, -1) } } };

  if (scope === 'following') {
    ops.push(endBefore());
    if (changes) ops.push({ op: 'put', entry: { ...entry, date, ...changes, id: isFirst ? entry.id : newId() } });
    return normalize(ops);
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

/** A remove followed by a put of the same id is a put. */
function normalize(ops: MealOp[]): MealOp[] {
  const puts = new Set(ops.filter((o) => o.op === 'put').map((o) => (o as { entry: MealEntry }).entry.id));
  return ops.filter((o) => !(o.op === 'remove' && puts.has(o.id)));
}
