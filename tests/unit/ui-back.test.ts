import { describe, expect, it } from 'vitest';
import { createBackStack } from '../../src/ui/back';

/**
 * A browser history as Chrome runs it: pushState adds an entry after the
 * current one at once; a traversal is applied later (then popstate), to the
 * entry `n` back from where it was asked, even when a push came in between.
 * Each entry records how many entries the app said it held there.
 */
function fakeHistory() {
  const depths = [0];
  let index = 0;
  const traversals: (() => void)[] = [];
  const tasks: (() => void)[] = [];
  let onPop: () => void = () => {};
  return {
    h: {
      push: (depth: number) => {
        depths.length = index + 1;
        depths.push(depth);
        index++;
      },
      back: (n: number) => {
        const target = Math.max(0, index - n);
        traversals.push(() => {
          index = target;
          onPop();
        });
      },
    },
    later: (fn: () => void) => void tasks.push(fn),
    listen: (fn: () => void) => (onPop = fn),
    /** The current task's microtasks. */
    tick: () => {
      while (tasks.length) tasks.shift()!();
    },
    /** The traversals asked for so far land. */
    land: () => traversals.splice(0).forEach((t) => t()),
    /** The end of the current task: microtasks, then the traversals the browser applies. */
    settle: () => {
      while (tasks.length || traversals.length) {
        while (tasks.length) tasks.shift()!();
        traversals.shift()?.();
      }
    },
    /** The person presses Back. */
    pressBack: () => {
      index = Math.max(0, index - 1);
      onPop();
    },
    /** Entries above the app's own, by where the history is. */
    get depth() {
      return depths[index];
    },
    /** Entries in the history, the app's own first one included. */
    get length() {
      return depths.length;
    },
  };
}

function setup(held = 0) {
  const f = fakeHistory();
  const s = createBackStack(f.h, { later: f.later, held });
  f.listen(() => s.popped());
  return { f, s };
}

describe('back stack', () => {
  it('closes the top overlay on Back, one per press', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('overlay', () => closed.push('sheet'));
    s.open('overlay', () => closed.push('confirm'));
    f.settle();
    expect(f.depth).toBe(2);
    f.pressBack();
    expect(closed).toEqual(['confirm']);
    f.pressBack();
    expect(closed).toEqual(['confirm', 'sheet']);
    expect(s.depth).toBe(0);
    expect(f.depth).toBe(0);
  });

  it('gives the entry back when an overlay closes another way, without taking that for a Back', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('overlay', () => closed.push('sheet'));
    const releaseConfirm = s.open('overlay', () => closed.push('confirm'));
    f.settle();
    releaseConfirm();
    f.settle();
    expect(closed).toEqual([]);
    expect(f.depth).toBe(1);
    // The next Back closes the sheet, not nothing.
    f.pressBack();
    expect(closed).toEqual(['sheet']);
  });

  it('does nothing when an overlay closed by Back releases its entry as it unmounts', () => {
    const { f, s } = setup();
    let release = () => {};
    release = s.open('overlay', () => release());
    f.settle();
    f.pressBack();
    f.settle();
    expect(f.depth).toBe(0);
    expect(s.depth).toBe(0);
  });

  it('keeps the history and the stack the same depth through mixed closes', () => {
    const { f, s } = setup();
    const a = s.open('overlay', () => a());
    const b = s.open('overlay', () => b());
    const c = s.open('overlay', () => c());
    f.settle();
    b();
    f.settle();
    f.pressBack(); // closes c
    f.settle();
    a();
    f.settle();
    expect(s.depth).toBe(0);
    expect(f.depth).toBe(0);
  });

  it('keeps one entry when a view closes and another opens at once (a sheet swapped for the editor)', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('tab', () => closed.push('tab'));
    const sheet = s.open('overlay', () => closed.push('sheet'));
    f.settle();
    expect(f.depth).toBe(2);
    sheet();
    s.open('overlay', () => closed.push('editor'));
    f.settle();
    expect(f.depth).toBe(2);
    f.pressBack();
    expect(closed).toEqual(['editor']);
    f.pressBack();
    expect(closed).toEqual(['editor', 'tab']);
    expect(f.depth).toBe(0);
  });

  it('opens nothing over its own traversal still on its way, and catches up when it lands', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('tab', () => closed.push('tab'));
    const sheet = s.open('overlay', () => closed.push('sheet'));
    f.settle();
    sheet();
    f.tick();
    // The traversal giving the sheet's entry back has not landed when the editor opens (in a later task).
    s.open('overlay', () => closed.push('editor'));
    f.tick();
    f.land();
    f.settle();
    expect(f.depth).toBe(2);
    f.pressBack();
    expect(closed).toEqual(['editor']);
    expect(f.depth).toBe(1);
  });

  it('gives nothing back once the page is being replaced (a layout switch after its confirmation)', () => {
    const { f, s } = setup();
    s.open('tab', () => {});
    const confirm = s.open('overlay', () => {});
    f.settle();
    expect(f.depth).toBe(2);
    s.leave();
    confirm();
    s.open('overlay', () => {});
    f.settle();
    // No traversal (it would cancel the reload), and no push.
    expect(f.depth).toBe(2);
    expect(f.length).toBe(3);
  });

  it('goes back over the entries a reload left behind', () => {
    const { f, s } = setup(0);
    f.h.push(1);
    f.h.push(2);
    // The page reloads at depth 2 with nothing open.
    const reloaded = createBackStack(f.h, { later: f.later, held: 2 });
    f.listen(() => reloaded.popped());
    s.open('overlay', () => {});
    f.settle();
    expect(f.depth).toBe(0);
    expect(reloaded.depth).toBe(0);
  });

  it('keeps an entry opened while another is being given back (details giving way to the editor)', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('tab', () => closed.push('tab'));
    const details = s.open('overlay', () => closed.push('details'));
    f.settle();
    expect(f.depth).toBe(2);
    // In one task: the details close (their entry is given back) and the editor opens.
    details();
    const editor = s.open('overlay', () => closed.push('editor'));
    f.settle();
    expect(f.depth).toBe(2);
    // The editor saves and gives its entry back: the tab's entry is current again.
    editor();
    f.settle();
    expect(f.depth).toBe(1);
    expect(s.depth).toBe(1);
    // So the next Back closes the tab's view, and the one after leaves.
    f.pressBack();
    expect(closed).toEqual(['tab']);
    expect(f.depth).toBe(0);
  });

  it('pushes nothing for an entry released before its turn came', () => {
    const { f, s } = setup();
    const a = s.open('overlay', () => {});
    a();
    const b = s.open('overlay', () => {});
    b();
    f.settle();
    expect(f.depth).toBe(0);
    expect(f.length).toBe(1);
    expect(s.depth).toBe(0);
  });

  it('moves nothing when one overlay closes as another opens (a menu item that opens a sheet)', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('tab', () => closed.push('shell'));
    s.open('view', () => closed.push('list'));
    const menu = s.open('overlay', () => closed.push('menu'));
    f.settle();
    menu();
    s.open('overlay', () => closed.push('editor'));
    f.settle();
    expect(f.depth).toBe(3);
    f.pressBack();
    f.pressBack();
    f.pressBack();
    expect(closed).toEqual(['editor', 'list', 'shell']);
    expect(f.depth).toBe(0);
  });

  it('keeps one entry per holder when the next overlay opens after the close is given back', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('tab', () => closed.push('shell'));
    s.open('view', () => closed.push('list'));
    const menu = s.open('overlay', () => closed.push('menu'));
    f.settle();
    menu();
    // The menu's close is reconciled, then the sheet opens a microtask later (after the PIN check), before the traversal lands.
    f.tick();
    s.open('overlay', () => closed.push('editor'));
    f.settle();
    expect(f.depth).toBe(3);
    f.pressBack();
    f.pressBack();
    f.pressBack();
    expect(closed).toEqual(['editor', 'list', 'shell']);
    expect(f.depth).toBe(0);
  });

  it("closes a tab's inner view before the shell's entry, though the view took its entry first", () => {
    // Coming back to Lists with a list open: the list's layout effect (a child) runs before the shell's.
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('view', () => closed.push('list'));
    s.open('tab', () => closed.push('shell'));
    f.settle();
    expect(f.depth).toBe(2);
    f.pressBack();
    expect(closed).toEqual(['list']);
    f.pressBack();
    expect(closed).toEqual(['list', 'shell']);
    expect(f.depth).toBe(0);
  });

  it('keeps overlays above views and views above the shell, in any order of opening', () => {
    // Today's first-task link: the Tasks tab and its editor open in one render, the editor's entry first.
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('overlay', () => closed.push('editor'));
    s.open('view', () => closed.push('view'));
    s.open('tab', () => closed.push('shell'));
    s.open('overlay', () => closed.push('confirm'));
    f.settle();
    expect(f.depth).toBe(4);
    for (let i = 0; i < 4; i++) f.pressBack();
    expect(closed).toEqual(['confirm', 'editor', 'view', 'shell']);
    expect(f.depth).toBe(0);
  });

  it('a view opened while an overlay is open goes under it', () => {
    const { f, s } = setup();
    const closed: string[] = [];
    s.open('tab', () => closed.push('shell'));
    s.open('overlay', () => closed.push('sheet'));
    // The list editor makes a list and opens it (onCreated) before the editor's close lands.
    s.open('view', () => closed.push('list'));
    f.settle();
    expect(f.depth).toBe(3);
    f.pressBack();
    expect(closed).toEqual(['sheet']);
    f.pressBack();
    f.pressBack();
    expect(closed).toEqual(['sheet', 'list', 'shell']);
    expect(f.depth).toBe(0);
  });

  it('after a reload, opens nothing until its trip back over the old entries has landed', () => {
    const f = fakeHistory();
    f.h.push(1);
    f.h.push(2);
    const s = createBackStack(f.h, { later: f.later, held: 2 });
    f.listen(() => s.popped());
    s.open('overlay', () => {});
    f.tick();
    expect(f.depth).toBe(2);
    f.settle();
    expect(f.depth).toBe(1);
    expect(s.depth).toBe(1);
  });
});
