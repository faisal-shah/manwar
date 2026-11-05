import { useLayoutEffect, useRef } from 'preact/hooks';

/**
 * The phone's back gesture. Each open overlay or sub-view on the phone holds
 * one browser history entry; Back pops the top one and closes what holds it,
 * instead of leaving the app. Something closed another way (its X, Save)
 * gives its entry back with history.back(), and the popstate that causes is
 * not taken for a Back. The wall (Fully Kiosk) has no back gesture and pushes
 * nothing.
 */

export interface HistoryLike {
  push(depth: number): void;
  back(): void;
}

export function createBackStack(h: HistoryLike) {
  const stack: { close: () => void }[] = [];
  /** popstate events still to come from our own history.back() calls. */
  let ours = 0;
  return {
    /** Hold an entry until the returned release is called; Back calls `close` instead. */
    open(close: () => void): () => void {
      const entry = { close };
      stack.push(entry);
      h.push(stack.length);
      return () => {
        const i = stack.indexOf(entry);
        if (i < 0) return;
        stack.splice(i, 1);
        ours++;
        h.back();
      };
    },
    /** A popstate: ours, or the person going back. */
    popped(): void {
      if (ours > 0) {
        ours--;
        return;
      }
      stack.pop()?.close();
    },
    /** Entries held now (tests). */
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
    back: () => history.back(),
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
