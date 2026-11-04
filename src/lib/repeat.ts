import type { ISODate, Repeat, Weekday } from '../data/types';
import { addDays, dayLong, dayShort, diffDays, fromISODate, monthsBetween, startOfWeek, weekdayOf } from './date';

/** Does a rule that started on `start` produce an occurrence on `date`? */
export function occursOn(rule: Repeat | undefined, start: ISODate, date: ISODate): boolean {
  if (date < start) return false;
  if (!rule) return date === start;
  if (rule.until && date > rule.until) return false;
  const every = Math.max(1, rule.every);
  switch (rule.unit) {
    case 'day':
      return diffDays(start, date) % every === 0;
    case 'week': {
      const days = rule.weekdays?.length ? rule.weekdays : [weekdayOf(start)];
      if (!days.includes(weekdayOf(date))) return false;
      const weeks = diffDays(startOfWeek(start, 0), startOfWeek(date, 0)) / 7;
      return weeks % every === 0;
    }
    case 'month': {
      if (fromISODate(date).getDate() !== fromISODate(start).getDate()) return false;
      return monthsBetween(start, date) % every === 0;
    }
    case 'year': {
      if (date.slice(5) !== start.slice(5)) return false;
      return (Number(date.slice(0, 4)) - Number(start.slice(0, 4))) % every === 0;
    }
  }
}

/** Occurrence dates within [from, to]. */
export function occurrencesBetween(rule: Repeat | undefined, start: ISODate, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const first = from > start ? from : start;
  for (let d = first; d <= to; d = addDays(d, 1)) if (occursOn(rule, start, d)) out.push(d);
  return out;
}

/** Latest occurrence on or before `date`, looking back at most `maxDays`. */
export function lastOccurrenceOnOrBefore(rule: Repeat | undefined, start: ISODate, date: ISODate, maxDays = 400): ISODate | null {
  for (let i = 0, d = date; i <= maxDays && d >= start; i++, d = addDays(d, -1)) if (occursOn(rule, start, d)) return d;
  return null;
}

const UNIT_NAMES: Record<Repeat['unit'], [string, string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};

const ALL_WEEK: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** "Daily", "Weekly on Mon, Wed", "Every 2 weeks on Sat", "Weekdays", "Monthly on day 4". */
export function describeRepeat(rule: Repeat | undefined, start: ISODate): string {
  if (!rule) return 'Does not repeat';
  const n = Math.max(1, rule.every);
  let s: string;
  if (rule.unit === 'week') {
    const days = (rule.weekdays?.length ? rule.weekdays : [weekdayOf(start)]).slice().sort();
    const set = days.join(',');
    if (n === 1 && set === ALL_WEEK.join(',')) s = 'Daily';
    else if (n === 1 && set === '1,2,3,4,5') s = 'Weekdays';
    else {
      const names = days.length === 1 ? dayLong(days[0]) : days.map(dayShort).join(', ');
      s = `${n === 1 ? 'Weekly' : `Every ${n} weeks`} on ${names}`;
    }
  } else if (rule.unit === 'day') s = n === 1 ? 'Daily' : `Every ${n} days`;
  else if (rule.unit === 'month') s = `${n === 1 ? 'Monthly' : `Every ${n} months`} on day ${fromISODate(start).getDate()}`;
  else s = n === 1 ? 'Yearly' : `Every ${n} years`;
  if (rule.until) s += `, until ${rule.until}`;
  return s;
}

export const unitName = (unit: Repeat['unit'], n: number) => UNIT_NAMES[unit][n === 1 ? 0 : 1];
