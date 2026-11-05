import { describe, expect, it } from 'vitest';
import { asleepAt, inWindow, sleepNowEnd, WAKE_MS } from '../../src/core/sleep';
import type { DisplayCommand, List, ListItem, MealCategory, MealEntry, TimeWindow, WallTimer } from '../../src/data/types';
import { LEAD_MS, SLEEP_GRACE_MS, STALE_MS, newRun, onWall, stoppedAt, timerSleepHold } from '../../src/features/timer/logic';
import { listSummary, summaryLine } from '../../src/phone/lists/logic';
import { mealsOn, planCategory, weekByDay } from '../../src/phone/meals/logic';
import { clockLeft, minutesField } from '../../src/phone/timer/logic';
import { describeCommand, wallAsleepGuess, whenSent } from '../../src/phone/wallscreen/logic';

/** Local instants (tests run in America/Chicago). */
const at = (s: string) => new Date(s).getTime();
const NIGHT: TimeWindow = { enabled: true, from: '21:30', to: '06:30' };
const OFF: TimeWindow = { enabled: false, from: '21:30', to: '06:30' };

describe('the sleep rule', () => {
  it('reads a window that crosses midnight', () => {
    expect(inWindow(NIGHT, 22 * 60)).toBe(true);
    expect(inWindow(NIGHT, 6 * 60)).toBe(true);
    expect(inWindow(NIGHT, 6 * 60 + 30)).toBe(false);
    expect(inWindow(OFF, 23 * 60)).toBe(false);
  });
  it('ends Sleep now at the end of the window, or at 7:00 without one', () => {
    expect(sleepNowEnd(NIGHT, at('2026-11-04T22:10'))).toBe(at('2026-11-05T06:30'));
    expect(sleepNowEnd(NIGHT, at('2026-11-05T05:00'))).toBe(at('2026-11-05T06:30'));
    expect(sleepNowEnd(OFF, at('2026-11-04T11:44'))).toBe(at('2026-11-05T07:00'));
  });
  it('ranks woken over Sleep now over a timer over the window', () => {
    const t = at('2026-11-04T23:00');
    const none = { wokenUntil: 0, forcedUntil: 0, heldUntil: 0 };
    expect(asleepAt(t, none, NIGHT)).toBe(true);
    expect(asleepAt(t, { ...none, heldUntil: t + 1 }, NIGHT)).toBe(false);
    expect(asleepAt(t, { ...none, heldUntil: t + 1, forcedUntil: t + 1 }, NIGHT)).toBe(true);
    expect(asleepAt(t, { wokenUntil: t + 1, forcedUntil: t + 1, heldUntil: 0 }, NIGHT)).toBe(false);
  });
  it('holds sleep a few minutes past a timer, or past its stop', () => {
    const t: WallTimer = { id: 'wall', run: 'r2', minutes: 10, startAt: 1000, endAt: 601_000 };
    expect(timerSleepHold(t)).toBe(601_000 + SLEEP_GRACE_MS);
    expect(timerSleepHold({ ...t, stopped: { r2: 5000 } })).toBe(5000 + SLEEP_GRACE_MS);
    // A stop meant for the run before (landing late) does not end this one's hold.
    expect(timerSleepHold({ ...t, stopped: { r1: 5000 } })).toBe(601_000 + SLEEP_GRACE_MS);
    expect(timerSleepHold(undefined)).toBe(0);
  });
});

describe('timer runs', () => {
  const t = newRun('r2', 10, 1000, 'phone1');
  it('starts after the lead-in, from the phone that started it', () => {
    expect(t).toEqual({
      id: 'wall',
      run: 'r2',
      minutes: 10,
      startAt: 1000 + LEAD_MS,
      endAt: 1000 + LEAD_MS + 600_000,
      startedBy: 'phone1',
    });
    expect(() => newRun('r3', 0, 1000)).toThrow();
  });
  it('is stopped only by a stop for its own run', () => {
    expect(stoppedAt(t)).toBeUndefined();
    expect(stoppedAt({ ...t, stopped: { r1: 5000 } })).toBeUndefined();
    expect(stoppedAt({ ...t, stopped: { r1: 5000, r2: 6000 } })).toBe(6000);
    expect(onWall({ ...t, stopped: { r1: 5000 } }, 6000)).toBe(true);
    expect(onWall({ ...t, stopped: { r2: 6000 } }, 6000)).toBe(false);
  });
  it('is left over a while after it ends, with nobody to dismiss it', () => {
    expect(onWall(t, t.endAt + STALE_MS - 1)).toBe(true);
    expect(onWall(t, t.endAt + STALE_MS)).toBe(false);
  });
});

describe("the phone's guess at the wall's screen", () => {
  const cmd = (kind: 'sleep' | 'wake', when: string): DisplayCommand => ({ id: 'display', kind, nonce: 'n', at: at(when) });
  it('follows the window with nothing asked', () => {
    expect(wallAsleepGuess(NIGHT, undefined, undefined, at('2026-11-04T23:00'))).toBe(true);
    expect(wallAsleepGuess(NIGHT, undefined, undefined, at('2026-11-04T11:44'))).toBe(false);
  });
  it('is asleep after Sleep now until the window ends, and awake after Wake up for a while', () => {
    const sleep = cmd('sleep', '2026-11-04T11:44');
    expect(wallAsleepGuess(OFF, sleep, undefined, at('2026-11-04T18:00'))).toBe(true);
    expect(wallAsleepGuess(OFF, sleep, undefined, at('2026-11-05T07:01'))).toBe(false);
    const wake = cmd('wake', '2026-11-04T23:00');
    expect(wallAsleepGuess(NIGHT, wake, undefined, at('2026-11-04T23:00') + WAKE_MS - 1)).toBe(false);
    expect(wallAsleepGuess(NIGHT, wake, undefined, at('2026-11-04T23:00') + WAKE_MS)).toBe(true);
  });
  it('is awake in the window while a timer runs', () => {
    const t = at('2026-11-04T22:00');
    const timer: WallTimer = { id: 'wall', run: 'r1', minutes: 10, startAt: t, endAt: t + 600_000 };
    expect(wallAsleepGuess(NIGHT, undefined, timer, t + 60_000)).toBe(false);
    expect(wallAsleepGuess(NIGHT, undefined, timer, t + 600_000 + SLEEP_GRACE_MS)).toBe(true);
  });
  it('is awake for a timer started after Sleep now, and asleep for one started before it', () => {
    const sleep = cmd('sleep', '2026-11-04T11:44');
    const after = newRun('r1', 10, at('2026-11-04T11:50'));
    expect(wallAsleepGuess(OFF, sleep, after, at('2026-11-04T11:55'))).toBe(false);
    // Past the timer's hold, the wall follows its (here, disabled) window: Sleep now is over.
    expect(wallAsleepGuess(OFF, sleep, after, after.endAt + SLEEP_GRACE_MS)).toBe(false);
    const before = newRun('r1', 30, at('2026-11-04T11:40'));
    expect(wallAsleepGuess(OFF, sleep, before, at('2026-11-04T11:55'))).toBe(true);
  });
  it('says what was asked and when', () => {
    const now = at('2026-11-04T21:20');
    expect(whenSent(at('2026-11-04T21:12'), now, '12h')).toBe('at 9:12 PM');
    expect(whenSent(at('2026-11-03T21:12'), now, '24h')).toBe('yesterday at 21:12');
    expect(whenSent(at('2026-10-30T09:00'), now, '12h')).toBe('Oct 30 at 9 AM');
    expect(describeCommand(cmd('sleep', '2026-11-04T21:12'), now, '12h', "Mamma's phone")).toBe(
      "Sleep now, asked at 9:12 PM by Mamma's phone.",
    );
    expect(describeCommand(cmd('wake', '2026-11-04T21:12'), now, '12h')).toBe('Wake up, asked at 9:12 PM.');
  });
});

describe('the phone timer', () => {
  it('keeps digits only, without leading zeros, at most three', () => {
    expect(minutesField('12')).toBe('12');
    expect(minutesField('007')).toBe('7');
    expect(minutesField('1,5 min')).toBe('15');
    expect(minutesField('12345')).toBe('123');
    expect(minutesField('0')).toBe('');
  });
  it('counts down in minutes and seconds, with hours past an hour', () => {
    expect(clockLeft(10 * 60_000)).toBe('10:00');
    expect(clockLeft(4 * 60_000 + 4_200)).toBe('4:05');
    expect(clockLeft(0)).toBe('0:00');
    expect(clockLeft(62 * 60_000 + 5_000)).toBe('1:02:05');
  });
});

describe('a list row on the phone', () => {
  const list: List = {
    id: 'g',
    title: 'Grocery',
    kind: 'grocery',
    sections: [{ id: 'p', name: 'Produce' }],
    order: 0,
    createdAt: 0,
  };
  const item = (id: string, text: string, p: Partial<ListItem> = {}): ListItem => ({
    id,
    listId: 'g',
    text,
    done: false,
    order: 0,
    createdAt: 0,
    ...p,
  });
  it('names the first open items in list order, then how many more', () => {
    const items = [
      item('a', 'Bananas', { sectionId: 'p', order: 0 }),
      item('b', 'Milk', { order: 1 }),
      item('c', 'Eggs', { order: 0 }),
      item('d', 'Rice', { done: true, doneAt: 5 }),
      item('e', 'Spinach', { sectionId: 'p', order: 1 }),
    ];
    const s = listSummary(list, items);
    expect(s).toEqual({ first: ['Eggs', 'Milk', 'Bananas'], more: 1, open: 4, done: 1 });
    expect(summaryLine(s)).toBe('⁨Eggs⁩, ⁨Milk⁩, ⁨Bananas⁩ +1');
  });
  it('says when everything is done or nothing is on it', () => {
    expect(summaryLine(listSummary(list, [item('d', 'Rice', { done: true })]))).toBe('All 1 done');
    expect(summaryLine(listSummary(list, []))).toBe('Nothing on it yet');
  });
});

describe('the week of meals on the phone', () => {
  const cat = (id: MealCategory['id'], name: string): MealCategory => ({
    id,
    name,
    color: '#888888',
    visible: true,
    showOnCalendar: true,
  });
  const cats = [cat('breakfast', 'Breakfast'), cat('lunch', 'Lunch'), cat('dinner', 'Dinner')];
  const meal = (id: string, p: Partial<MealEntry>): MealEntry => ({
    id,
    date: '2026-11-04',
    category: 'dinner',
    title: id,
    order: 0,
    createdAt: 0,
    ...p,
  });
  const entries = [
    meal('Pizza', { category: 'dinner' }),
    meal('Eggs', { category: 'breakfast', repeat: { every: 1, unit: 'day' } }),
    meal('Salad', { category: 'dinner', order: 1 }),
    meal('Chips', { category: 'snack' }),
  ];
  it('lists each day by category order, then cell order, repeating meals included', () => {
    const week = weekByDay(entries, '2026-11-01', cats);
    expect(week.map((d) => d.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(week[3].meals.map((m) => m.entry.title)).toEqual(['Eggs', 'Pizza', 'Salad']);
    expect(week[4].meals.map((m) => m.entry.title)).toEqual(['Eggs']);
    expect(week[0].meals).toEqual([]);
    // A hidden category (snack, not given) is left out.
    expect(mealsOn(entries, '2026-11-04', cats).some((m) => m.category.id === 'snack')).toBe(false);
  });
  it('plans into the first empty category of a day, else dinner', () => {
    const week = weekByDay(entries, '2026-11-01', cats);
    expect(planCategory(week[0], cats)).toBe('breakfast');
    expect(planCategory(week[3], cats)).toBe('lunch');
    const full = weekByDay([...entries, meal('Soup', { category: 'lunch' })], '2026-11-01', cats);
    expect(planCategory(full[3], cats)).toBe('dinner');
    expect(planCategory(week[0], [])).toBeNull();
  });
});
