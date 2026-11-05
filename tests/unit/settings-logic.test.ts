import { describe, expect, it } from 'vitest';
import { NOBODY, type EventMeta, type Profile, type Reward, type Task } from '../../src/data/types';
import { changedFields } from '../../src/data/settings';
import { isolate } from '../../src/lib/text';
import {
  canHideTab,
  describeProfileDelete,
  fallbackTab,
  isPin,
  MOVE_RUN_MS,
  moveId,
  moveTarget,
  nameTaken,
  planProfileDelete,
  profileFields,
  draftProblem,
  formatBirthday,
  setTabShown,
  type ProfileDraft,
} from '../../src/features/settings/logic';
import { PIN_TRIES, pauseSecondsLeft, pinPause } from '../../src/core/pin';

describe('tab visibility', () => {
  it('hides and shows ordinary tabs', () => {
    expect(setTabShown([], 'rewards', false)).toEqual(['rewards']);
    expect(setTabShown(['rewards', 'meals'], 'rewards', true)).toEqual(['meals']);
    expect(setTabShown(['rewards'], 'rewards', false)).toEqual(['rewards']);
  });
  it('keeps Home or Calendar on', () => {
    expect(canHideTab([], 'home')).toBe(true);
    expect(canHideTab(['home'], 'calendar')).toBe(false);
    expect(canHideTab(['calendar'], 'home')).toBe(false);
    expect(setTabShown(['home'], 'calendar', false)).toEqual(['home']);
    expect(canHideTab(['home'], 'home')).toBe(true);
  });
  it('falls back to the first landing tab still shown', () => {
    expect(fallbackTab([])).toBe('home');
    expect(fallbackTab(['home', 'lists'])).toBe('calendar');
  });
});

describe('profile order', () => {
  it('moves one id and keeps the rest in order', () => {
    expect(moveId(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveId(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveId(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });

  it('keeps moving the same row when taps repeat on one spot', () => {
    // e moves up from index 4; the finger stays on index 4, which now holds d's button. Each tap comes
    // within MOVE_RUN_MS of the last, the run as a whole takes longer.
    let ids = ['a', 'b', 'c', 'd', 'e'];
    let run = null as ReturnType<typeof moveTarget>['run'] | null;
    for (const at of [0, 500, 1000]) {
      const t = moveTarget(ids, 4, -1, run, at);
      ids = moveId(ids, t.index, t.index - 1);
      run = t.run;
    }
    expect(ids).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('starts a new run on another spot, the other way, or after a pause', () => {
    const run = { id: 'e', dir: -1 as const, spot: 4, at: 0 };
    const ids = ['a', 'b', 'c', 'e', 'd'];
    expect(moveTarget(ids, 4, -1, run, 300).index).toBe(3);
    expect(moveTarget(ids, 2, -1, run, 300).index).toBe(2);
    expect(moveTarget(ids, 4, 1, run, 300).index).toBe(4);
    expect(moveTarget(ids, 4, -1, run, MOVE_RUN_MS + 1).index).toBe(4);
    // The row the run moved is gone (deleted meanwhile): the tap moves what it landed on.
    expect(moveTarget(['a', 'b', 'c', 'd'], 3, -1, run, 300).index).toBe(3);
  });
});

const task = (id: string, assignees: string[], extra: Partial<Task> = {}): Task => ({
  id,
  kind: 'chore',
  title: id,
  assignees,
  upForGrabs: assignees.length === 0,
  stars: 1,
  date: '2026-11-04',
  order: 0,
  createdAt: 0,
  ...extra,
});
const reward = (id: string, profiles: string[], extra: Partial<Reward> = {}): Reward => ({
  id,
  title: id,
  cost: 10,
  profiles,
  renews: true,
  redeemedBy: {},
  order: 0,
  createdAt: 0,
  ...extra,
});
const meta = (id: string, profiles: string[]): EventMeta => ({ id, profiles, updatedAt: 0 });

describe('deleting a profile', () => {
  const data = {
    tasks: [
      task('solo', ['kid']),
      task('shared', ['kid', 'mom']),
      task('other', ['mom']),
      task('grabs', []),
      task('old', ['kid'], { archived: true }),
    ],
    rewards: [reward('mine', ['kid']), reward('ours', ['kid', 'mom']), reward('all', [])],
    eventMeta: [meta('e1', ['kid']), meta('e2', ['kid', 'mom']), meta('e3', ['*']), meta('e4', ['mom'])],
  };
  const plan = planProfileDelete('kid', data);

  it('archives what only that profile had', () => {
    expect(plan.archiveTasks).toEqual(['solo']);
    expect(plan.archiveRewards).toEqual(['mine']);
  });
  it('takes the profile off shared tasks and rewards', () => {
    expect(plan.unassignTasks).toEqual([{ id: 'shared', assignees: ['mom'] }]);
    expect(plan.unassignRewards).toEqual([{ id: 'ours', profiles: ['mom'] }]);
  });
  it('removes it from event assignments, marking solo events as no one’s (so an occurrence does not fall back to its series)', () => {
    expect(plan.eventMeta).toEqual([
      { id: 'e1', profiles: [NOBODY] },
      { id: 'e2', profiles: ['mom'] },
    ]);
  });
  it('explains the effect before deleting', () => {
    const text = describeProfileDelete('Kid', plan);
    // The name is isolated: an Arabic one keeps its punctuation on its own side.
    const kid = isolate('Kid');
    expect(text).toContain(`1 task only ${kid} had will be archived.`);
    expect(text).toContain(`${kid} is taken off 2 shared tasks and rewards.`);
    expect(text).toContain(`1 reward only ${kid} could redeem will be archived.`);
    expect(text).toContain(`${kid} is removed from 2 events; 1 event assigned only to ${kid} will wait in the unassigned queue.`);
    expect(text).toContain('Star history stays in the ledger.');
  });
  it('says only the closing line for a profile with nothing attached', () => {
    const empty = planProfileDelete('nobody', data);
    expect(describeProfileDelete('Nobody', empty)).toBe('Star history stays in the ledger. This cannot be undone.');
  });
});

describe('PIN', () => {
  it('is exactly four digits', () => {
    expect(isPin('1234')).toBe(true);
    expect(isPin('123')).toBe(false);
    expect(isPin('12a4')).toBe(false);
    expect(isPin('12345')).toBe(false);
  });
  it('pauses the pad after repeated wrong PINs, longer each time', () => {
    for (let n = 1; n < PIN_TRIES; n++) expect(pinPause(n)).toBe(0);
    expect(pinPause(PIN_TRIES)).toBe(30_000);
    expect(pinPause(PIN_TRIES + 1)).toBe(0);
    expect(pinPause(2 * PIN_TRIES)).toBe(60_000);
    expect(pinPause(3 * PIN_TRIES)).toBe(120_000);
    expect(pinPause(10 * PIN_TRIES)).toBe(5 * 60_000);
  });
  it('counts a pause down in whole seconds, from 30 for a 30-second pause', () => {
    const start = 1_000_000;
    expect(pauseSecondsLeft(start + 30_000, start)).toBe(30);
    expect(pauseSecondsLeft(start + 30_000, start + 1)).toBe(30);
    expect(pauseSecondsLeft(start + 30_000, start + 29_001)).toBe(1);
    expect(pauseSecondsLeft(start + 30_000, start + 30_000)).toBe(0);
    expect(pauseSecondsLeft(start + 30_000, start + 31_000)).toBe(0);
  });
});

describe('profile names', () => {
  const people = [
    { id: 'a', name: 'Sam' },
    { id: 'b', name: 'Asiyah ' },
  ];
  it('finds a name another profile has, ignoring case and spaces', () => {
    expect(nameTaken('sam', people)).toBe(true);
    expect(nameTaken('  Asiyah', people)).toBe(true);
    expect(nameTaken('Sami', people)).toBe(false);
  });
  it('lets a profile keep its own name', () => {
    expect(nameTaken('Sam', people, 'a')).toBe(false);
    expect(nameTaken('Sam', people, 'b')).toBe(true);
  });
});

describe('profile edits', () => {
  const opened = { name: 'Zaid', color: '#e11d48', emoji: undefined, birthday: '' };
  const changes = (was: ProfileDraft, next: ProfileDraft) => changedFields(profileFields(was), profileFields(next));
  it('names only the fields changed, the name trimmed', () => {
    expect(changes(opened, { ...opened })).toEqual({});
    expect(changes(opened, { ...opened, name: ' Zaid ' })).toEqual({});
    expect(changes(opened, { ...opened, name: ' Zayd ' })).toEqual({ name: 'Zayd' });
    expect(changes(opened, { ...opened, color: '#2563eb', birthday: '2019-03-07' })).toEqual({
      color: '#2563eb',
      birthday: '2019-03-07',
    });
  });
  it('clears an emoji or birthday taken away (undefined: the store deletes it), and not one that was never there', () => {
    const had = { ...opened, emoji: '🦁', birthday: '2019-03-07' };
    expect(changes(had, { ...had, emoji: undefined, birthday: '' })).toEqual({ emoji: undefined, birthday: undefined });
    expect(Object.keys(changes(had, { ...had, emoji: undefined, birthday: '' }))).toEqual(['emoji', 'birthday']);
    expect(changes(opened, { ...opened, emoji: '', birthday: '' })).toEqual({});
  });
  it('refuses an empty name, and a name another profile has unless the editor left it as it was', () => {
    const all = [
      { id: 'a', name: 'Sam' },
      { id: 'b', name: 'Samuel' },
    ] as Profile[];
    const samuel = { ...opened, name: 'Samuel' };
    expect(draftProblem({ ...opened, name: '  ' }, opened, all, 'z')).toBe('empty');
    expect(draftProblem({ ...opened, name: 'sam ' }, opened, all, 'z')).toBe('taken');
    expect(draftProblem({ ...opened, name: 'Sami' }, opened, all, 'z')).toBeNull();
    // a's editor opened on Samuel; the names were swapped elsewhere meanwhile (a is Sam now): a color change alone is saved.
    expect(draftProblem({ ...samuel, color: '#000000' }, samuel, all, 'a')).toBeNull();
    expect(draftProblem({ ...opened, name: 'Samuel' }, opened, all, 'a')).toBe('taken');
  });
  it('shows a birthday as month and day', () => {
    expect(formatBirthday('2019-03-07')).toBe('Mar 7');
  });
});
