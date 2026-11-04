import { describe, expect, it } from 'vitest';
import type { Task } from '../../src/data/types';
import { draftFrom, taskFrom, validateDraft, type Draft } from '../../src/features/tasks/draft';

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
    const t = taskFrom(fresh({ repeatMode: 'after', after: { every: 3, unit: 'day' } }), {
      ...base,
      lastDone: { a: '2026-11-02' },
    });
    expect(t.repeatAfterDone).toEqual({ every: 3, unit: 'day' });
    expect(t.repeat).toBeUndefined();
    expect(t.lastDone).toEqual({ a: '2026-11-02' });
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
