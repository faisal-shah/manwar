import { useLayoutEffect, useRef } from 'preact/hooks';

/**
 * The phone's back gesture. Each open overlay or sub-view on the phone holds
 * one browser history entry; Back pops the top one and closes what holds it,
 * instead of leaving the app. Something closed another way (its X, Save)
 * gives its entry back with history.go(-n), and the popstate that causes is
 * not taken for a Back. The wall (Fully Kiosk) has no back gesture and pushes
 * nothing.
 *
 * A traversal (history.go) is asynchronous and goes back from whatever
 * entry is current when it runs: an entry pushed before it lands would be
 * the one it takes away. So nothing is pushed while one of ours is on its
 * way; the entries are made up once it lands. Closes are given back a
 * microtask later, so one overlay closing as another opens (a menu item that
 * opens a sheet) moves the history not at all.
 */

export interface HistoryLike {
  /** pushState an entry; `depth` is how many entries are ours with it. */
  push(depth: number): void;
  /** history.go(delta), delta < 0; its popstate comes later. */
  go(delta: number): void;
}

export function createBackStack(h: HistoryLike, defer: (fn: () => void) => void = queueMicrotask) {
  const stack: { close: () => void }[] = [];
  /** Entries of ours in the history, counting a traversal of ours that has not landed yet. */
  let held = 0;
  /** Popstates still to come from our own traversals. */
  let ours = 0;
  let queued = false;
  /** Make the history hold one entry per holder, unless a traversal of ours is still on its way. */
  const reconcile = () => {
    if (ours > 0) return;
    while (held < stack.length) h.push(++held);
    if (held > stack.length) {
      ours++;
      h.go(stack.length - held);
      held = stack.length;
    }
  };
  const later = () => {
    if (queued) return;
    queued = true;
    defer(() => {
      queued = false;
      reconcile();
    });
  };
  return {
    /** Hold an entry until the returned release is called; Back calls `close` instead. */
    open(close: () => void): () => void {
      const entry = { close };
      stack.push(entry);
      reconcile();
      return () => {
        const i = stack.indexOf(entry);
        if (i < 0) return;
        stack.splice(i, 1);
        later();
      };
    },
    /** A popstate: ours, or the person going back. */
    popped(): void {
      if (ours > 0) {
        ours--;
        reconcile();
        return;
      }
      if (held > 0) held--;
      stack.pop()?.close();
      later();
    },
    /** Holders now (tests). */
    get depth() {
      return stack.length;
    },
    /** The next popstate is ours (a history.go issued outside open/release). */
    expectPop(): void {
      ours++;
    },
  };
}

const DEPTH = 'manwarBack';

let stack: ReturnType<typeof createBackStack> | null = null;

function phoneStack(): ReturnType<typeof createBackStack> {
  if (stack) return stack;
  const s = createBackStack({
    push: (depth) => history.pushState({ [DEPTH]: depth }, ''),
    go: (delta) => history.go(delta),
  });
  // A reload keeps the entries the last page pushed, and nothing holds them now: go back past them.
  const left = Number((history.state as Record<string, unknown> | null)?.[DEPTH]) || 0;
  if (left > 0) {
    s.expectPop();
    history.go(-left);
  }
  window.addEventListener('popstate', () => s.popped());
  stack = s;
  return s;
}

/**
 * While mounted and `active`, the phone's Back calls `onBack` (the latest one
 * passed). The entry is pushed as the view mounts (a layout effect), not
 * after the next paint, so a Back pressed right after opening it closes it.
 */
export function useBack(onBack: () => void, active: boolean): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  useLayoutEffect(() => {
    if (!active) return;
    return phoneStack().open(() => latest.current());
  }, [active]);
}
