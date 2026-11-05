import { useLayoutEffect, useRef } from 'preact/hooks';

/**
 * The phone's back gesture. Each open overlay or sub-view on the phone holds
 * one browser history entry; Back pops the top one and closes what holds it,
 * instead of leaving the app. Something closed another way (its X, Save)
 * gives its entry back with a history traversal, and the popstate that
 * causes is not taken for a Back. The wall (Fully Kiosk) has no back gesture
 * and pushes nothing.
 */

export interface HistoryLike {
  /** Add an entry: `depth` entries are now held above the app's own. */
  push(depth: number): void;
  /** Go back over `n` entries; its popstate comes later. */
  back(n: number): void;
}

export function createBackStack(
  h: HistoryLike,
  opts: {
    /** Entries a reload left behind: nothing holds them now, so they are gone back over. */
    held?: number;
    /** Runs the reconciliation once the current task's opens and closes are done (a microtask). */
    later?: (fn: () => void) => void;
  } = {},
) {
  const later = opts.later ?? queueMicrotask;
  const stack: { close: () => void }[] = [];
  /** Entries pushed and not gone back over. */
  let held = opts.held ?? 0;
  /** popstate events still to come from our own traversals. */
  let ours = 0;
  let due = false;

  /*
   * Bring the browser's entries to the stack's depth. Once per task, so a
   * view closed and another opened together (Edit swapping the event sheet
   * for the editor) keep one entry between them: going back and pushing at
   * once, Chrome applies the push and then goes back past it, and every
   * Back after is off by one. Nothing is pushed while one of our own
   * traversals is on its way, for the same reason: its popstate finishes
   * the job.
   */
  const reconcile = () => {
    due = false;
    if (ours > 0) return;
    if (held > stack.length) {
      ours++;
      h.back(held - stack.length);
      held = stack.length;
      return;
    }
    while (held < stack.length) h.push(++held);
  };
  const soon = () => {
    if (due) return;
    due = true;
    later(reconcile);
  };
  if (held > 0) reconcile();

  return {
    /** Hold an entry until the returned release is called; Back calls `close` instead. */
    open(close: () => void): () => void {
      const entry = { close };
      stack.push(entry);
      soon();
      return () => {
        const i = stack.indexOf(entry);
        if (i < 0) return;
        stack.splice(i, 1);
        soon();
      };
    },
    /** A popstate: ours, or the person going back. */
    popped(): void {
      if (ours > 0) {
        ours--;
        if (ours === 0) reconcile();
        return;
      }
      held = Math.max(0, held - 1);
      stack.pop()?.close();
    },
    /** Entries held now (tests). */
    get depth() {
      return stack.length;
    },
  };
}

const DEPTH = 'manwarBack';

let stack: ReturnType<typeof createBackStack> | null = null;

function phoneStack(): ReturnType<typeof createBackStack> {
  if (stack) return stack;
  // A reload keeps the entries the last page pushed, and nothing holds them now: they are gone back over.
  const left = Number((history.state as Record<string, unknown> | null)?.[DEPTH]) || 0;
  const s = createBackStack(
    {
      push: (depth) => history.pushState({ [DEPTH]: depth }, ''),
      back: (n) => history.go(-n),
    },
    { held: left },
  );
  window.addEventListener('popstate', () => s.popped());
  stack = s;
  return s;
}

/** On the phone, from the start: entries a reload left are gone back over before anything opens. */
export function startBack(): void {
  phoneStack();
}

/**
 * While mounted and `active`, the phone's Back calls `onBack` (the latest one
 * passed). The entry is taken as the view mounts (a layout effect) and pushed
 * before the next task, so a Back pressed right after opening it closes it.
 */
export function useBack(onBack: () => void, active: boolean): void {
  const latest = useRef(onBack);
  latest.current = onBack;
  useLayoutEffect(() => {
    if (!active) return;
    return phoneStack().open(() => latest.current());
  }, [active]);
}
