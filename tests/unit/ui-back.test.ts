import { describe, expect, it } from 'vitest';
import { createBackStack } from '../../src/ui/back';

/**
 * A browser history as Chrome runs it: pushState adds an entry at once;
 * history.go(n) aims at the entry n away from the current one when it is
 * called, lands later (a task of its own) and fires popstate then. An entry
 * pushed in between does not change where it lands.
 */
function chromeHistory() {
  let index = 0;
  const traversals: number[] = [];
  let onPop: () => void = () => {};
  return {
    h: {
      push: (_depth: number) => void index++,
      go: (delta: number) => void traversals.push(index + delta),
    },
    listen: (fn: () => void) => (onPop = fn),
    /** The person presses Back. */
    pressBack: () => {
      index--;
      onPop();
    },
    /** Our own traversals land, in order. */
    land: () => {
      while (traversals.length) {
        index = traversals.shift()!;
        onPop();
      }
    },
    /** Entries above the page's own. */
    get index() {
      return index;
    },
  };
}

/** Microtasks, run when the test says the current task has ended. */
function microtasks() {
  const queue: (() => void)[] = [];
  return { defer: (fn: () => void) => void queue.push(fn), run: () => queue.splice(0).forEach((f) => f()) };
}

function setup() {
  const f = chromeHistory();
  const m = microtasks();
  const s = createBackStack(f.h, m.defer);
  f.listen(() => s.popped());
  /** The current task ends: microtasks run, then our traversals land. */
  const settle = () => {
    m.run();
    f.land();
    m.run();
  };
  return { f, s, m, settle };
}

describe('back stack', () => {
  it('closes the top overlay on Back, one per press', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open(() => closed.push('sheet'));
    s.open(() => closed.push('confirm'));
    expect(f.index).toBe(2);
    f.pressBack();
    expect(closed).toEqual(['confirm']);
    f.pressBack();
    expect(closed).toEqual(['confirm', 'sheet']);
    expect(s.depth).toBe(0);
    expect(f.index).toBe(0);
  });

  it('gives the entry back when an overlay closes another way, without taking that for a Back', () => {
    const { f, s, settle } = setup();
    const closed: string[] = [];
    s.open(() => closed.push('sheet'));
    const releaseConfirm = s.open(() => closed.push('confirm'));
    releaseConfirm();
    settle();
    expect(closed).toEqual([]);
    expect(f.index).toBe(1);
    // The next Back closes the sheet, not nothing.
    f.pressBack();
    expect(closed).toEqual(['sheet']);
  });

  it('does nothing when an overlay closed by Back releases its entry as it unmounts', () => {
    const { f, s, settle } = setup();
    let release = () => {};
    release = s.open(() => release());
    f.pressBack();
    settle();
    expect(f.index).toBe(0);
    expect(s.depth).toBe(0);
  });

  it('keeps the history and the stack the same depth through mixed closes', () => {
    const { f, s, settle } = setup();
    const a = s.open(() => a());
    const b = s.open(() => b());
    const c = s.open(() => c());
    b();
    settle();
    f.pressBack(); // closes c
    settle();
    a();
    settle();
    expect(s.depth).toBe(0);
    expect(f.index).toBe(0);
  });

  it('moves nothing when one overlay closes as another opens (a menu item that opens a sheet)', () => {
    const { f, s, settle } = setup();
    const closed: string[] = [];
    s.open(() => closed.push('shell'));
    s.open(() => closed.push('list'));
    const menu = s.open(() => closed.push('menu'));
    menu();
    s.open(() => closed.push('editor'));
    settle();
    expect(f.index).toBe(3);
    f.pressBack();
    f.pressBack();
    f.pressBack();
    expect(closed).toEqual(['editor', 'list', 'shell']);
    expect(f.index).toBe(0);
  });

  it('keeps one entry per holder when the next overlay opens after the close is given back', () => {
    const { f, s, m, settle } = setup();
    const closed: string[] = [];
    s.open(() => closed.push('shell'));
    s.open(() => closed.push('list'));
    const menu = s.open(() => closed.push('menu'));
    menu();
    // The menu's render, then the sheet a microtask later (after the PIN check), before the traversal lands.
    m.run();
    s.open(() => closed.push('editor'));
    settle();
    expect(f.index).toBe(3);
    f.pressBack();
    f.pressBack();
    f.pressBack();
    expect(closed).toEqual(['editor', 'list', 'shell']);
    expect(f.index).toBe(0);
  });

  it('after a reload, waits for its own trip back before pushing', () => {
    const f = chromeHistory();
    f.h.push(1);
    f.h.push(2);
    const m = microtasks();
    const s = createBackStack(f.h, m.defer);
    f.listen(() => s.popped());
    s.expectPop();
    f.h.go(-2);
    s.open(() => {});
    f.land();
    m.run();
    expect(f.index).toBe(1);
    expect(s.depth).toBe(1);
  });
});
