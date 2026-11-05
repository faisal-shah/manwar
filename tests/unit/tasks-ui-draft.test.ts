import { describe, expect, it } from 'vitest';
import { UP_FOR_GRABS, type Task } from '../../src/data/types';
import {
  draftForList,
  draftFrom,
  savedFields,
  taskFrom,
  validateDraft,
  withRepeatMode,
  type Draft,
} from '../../src/features/tasks/draft';

const TODAY = '2026-11-04';
const base = { id: 'x', order: 7, createdAt: 1 };
const fresh = (p: Partial<Draft> = {}): Draft => ({
  ...draftFrom(null, TODAY, 'morning'),
  title: 'Dishes',
  assignees: ['a'],
  ...p,
});

describe('task draft', () => {
  it('starts a new chore for today with one star', () => {
    const d = draftFrom(null, TODAY, 'evening');
    expect([d.kind, d.date, d.stars, d.repeatMode, d.parts]).toEqual(['chore', TODAY, 1, 'none', ['evening']]);
  });

  it('starts a chore that repeats after it is done tomorrow when it is added in the evening', () => {
    const TOMORROW = '2026-11-05';
    const evening = draftFrom(null, TODAY, 'evening');
    const after = { ...evening, ...withRepeatMode(evening, 'after', true, TODAY, 'evening') };
    expect([after.repeatMode, after.date]).toEqual(['after', TOMORROW]);
    // Back to Once or On a schedule: the date it was given goes back to today.
    expect(withRepeatMode(after, 'none', true, TODAY, 'evening')).toMatchObject({ repeatMode: 'none', date: TODAY });
    expect(withRepeatMode(after, 'schedule', true, TODAY, 'evening')).toMatchObject({ date: TODAY });
    // A date the parent picked stays.
    const picked = { ...after, date: '2026-11-08', autoDate: false };
    expect(withRepeatMode(picked, 'none', true, TODAY, 'evening').date).toBeUndefined();
    const chosenFirst = { ...evening, date: '2026-11-07', autoDate: false };
    expect(withRepeatMode(chosenFirst, 'after', true, TODAY, 'evening').date).toBeUndefined();
    // Before the evening, or when editing a chore, the date stays where it is.
    const morning = draftFrom(null, TODAY, 'morning');
    expect(withRepeatMode(morning, 'after', true, TODAY, 'morning').date).toBeUndefined();
    expect(withRepeatMode(evening, 'after', false, TODAY, 'evening').date).toBeUndefined();
    // The saved chore carries the date, not the editor's flag.
    expect(taskFrom({ ...after, title: 'Clean the fish tank', assignees: ['a'] }, base)).not.toHaveProperty('autoDate');
  });

  it('validates title, assignees, parts and stars', () => {
    expect(validateDraft(fresh({ title: '  ' }))).toMatch(/title/);
    expect(validateDraft(fresh({ assignees: [] }))).toMatch(/Up for Grabs/);
    expect(validateDraft(fresh({ assignees: [], upForGrabs: true }))).toBeNull();
    expect(validateDraft(fresh({ kind: 'routine', assignees: [], upForGrabs: true }))).toMatch(/routine/);
    expect(validateDraft(fresh({ kind: 'routine', parts: [] }))).toMatch(/part of the day/);
    expect(validateDraft(fresh({ stars: 1001 }))).toMatch(/0 to 1000/);
    expect(validateDraft(fresh({ stars: 2.5 }))).toMatch(/whole number/);
    expect(validateDraft(fresh({ repeatMode: 'schedule', repeat: { every: 1, unit: 'day', until: '2026-11-01' } }))).toMatch(
      /end date/,
    );
    expect(validateDraft(fresh())).toBeNull();
  });

  it('saves an Up for Grabs chore without assignees and with its schedule', () => {
    const t = taskFrom(
      fresh({
        upForGrabs: true,
        timed: true,
        time: '13:30',
        repeatMode: 'schedule',
        repeat: { every: 1, unit: 'week', weekdays: [0, 3] },
      }),
      base,
    );
    expect(t).toMatchObject({ assignees: [], upForGrabs: true, time: '13:30', repeat: { unit: 'week', weekdays: [0, 3] } });
    expect(t.repeatAfterDone).toBeUndefined();
    expect(t.parts).toBeUndefined();
  });

  it('saves a repeat-after-done chore and keeps its completion history', () => {
    const stored = { ...base, repeatAfterDone: { every: 1, unit: 'week' as const }, lastDone: { a: '2026-11-02' } };
    const d = fresh({ repeatMode: 'after', after: { every: 3, unit: 'day' } });
    const t = taskFrom(d, stored);
    expect(t.repeatAfterDone).toEqual({ every: 3, unit: 'day' });
    expect(t.repeat).toBeUndefined();
    expect(t.lastDone).toEqual({ a: '2026-11-02' });
    // Left to the check-offs: one on another tablet meanwhile is not overwritten.
    expect(savedFields(d, stored)).not.toContain('lastDone');
  });

  it('starts the completion history over when the repeat mode changes', () => {
    const after: Task = {
      id: 'x',
      kind: 'chore',
      title: 'Water plants',
      assignees: ['a'],
      upForGrabs: false,
      stars: 1,
      date: '2026-06-01',
      repeatAfterDone: { every: 1, unit: 'week' },
      lastDone: { a: '2026-06-03' },
      order: 1,
      createdAt: 1,
    };
    // To a schedule: the old completion date is deleted, not left behind.
    const toSchedule = { ...draftFrom(after, TODAY, 'morning'), repeatMode: 'schedule' as const };
    expect(taskFrom(toSchedule, after).lastDone).toBeUndefined();
    expect(savedFields(toSchedule, after)).toContain('lastDone');
    // Back to repeat-after-done months later (a task saved with the June date still on it): due on its date,
    // not a week after June 3 and five months late.
    const scheduled: Task = { ...after, repeatAfterDone: undefined, repeat: { every: 1, unit: 'day' } };
    const back = { ...draftFrom(scheduled, TODAY, 'morning'), repeatMode: 'after' as const, date: TODAY };
    expect(taskFrom(back, scheduled).lastDone).toBeUndefined();
    expect(savedFields(back, scheduled)).toContain('lastDone');
  });

  it('drops chore-only fields when converted to a routine, and limits its repeat to days or weeks', () => {
    const chore: Task = {
      id: 'c',
      kind: 'chore',
      title: 'Bins',
      assignees: ['a'],
      upForGrabs: false,
      stars: 2,
      date: '2026-11-01',
      time: '18:00',
      repeat: { every: 1, unit: 'month' },
      order: 3,
      createdAt: 5,
    };
    const d = { ...draftFrom(chore, TODAY, 'morning'), kind: 'routine' as const, parts: ['evening' as const] };
    const t = taskFrom(d, chore);
    expect(t).toMatchObject({
      id: 'c',
      kind: 'routine',
      parts: ['evening'],
      repeat: { every: 1, unit: 'day' },
      order: 3,
      createdAt: 5,
    });
    expect(t.time).toBeUndefined();
    expect(t.upForGrabs).toBe(false);
  });

  it('round-trips an existing routine', () => {
    const r: Task = {
      id: 'r',
      kind: 'routine',
      title: 'Brush teeth',
      emoji: '🪥',
      assignees: ['a', 'b'],
      upForGrabs: false,
      stars: 2,
      date: '2026-10-14',
      repeat: { every: 1, unit: 'week', weekdays: [1, 2, 3, 4, 5] },
      parts: ['morning', 'evening'],
      notes: 'Two minutes',
      order: 4,
      createdAt: 9,
    };
    expect(taskFrom(draftFrom(r, TODAY, 'morning'), r)).toEqual({
      ...r,
      time: undefined,
      repeatAfterDone: undefined,
      archived: undefined,
      lastDone: undefined,
    });
  });
});

describe('a new task from one list', () => {
  const blank = draftFrom(null, TODAY, 'morning');

  it('is for the person whose list it is added from, and saves as theirs', () => {
    const d = draftForList(blank, 'b');
    expect([d.assignees, d.upForGrabs]).toEqual([['b'], false]);
    expect(taskFrom({ ...d, title: 'Fold laundry' }, base).assignees).toEqual(['b']);
  });

  it('from Up for Grabs is a chore up for grabs, with nobody to choose', () => {
    const d = draftForList({ ...blank, kind: 'routine' }, UP_FOR_GRABS);
    expect([d.kind, d.upForGrabs, d.assignees]).toEqual(['chore', true, []]);
    expect(validateDraft({ ...d, title: 'Sweep' })).toBeNull();
  });

  it('from no list is left as it is', () => {
    expect(draftForList(blank, undefined)).toBe(blank);
  });
});
