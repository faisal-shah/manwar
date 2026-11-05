import { describe, expect, it } from 'vitest';
import { createBackStack } from '../../src/ui/back';

/** A browser history: pushState grows it, back() pops it and fires popstate (later, as browsers do). */
function fakeHistory() {
  let length = 1;
  const pending: (() => void)[] = [];
  let onPop: () => void = () => {};
  return {
    h: {
      push: () => void length++,
      back: () => {
        length--;
        pending.push(() => onPop());
      },
    },
    listen: (fn: () => void) => (onPop = fn),
    /** The person presses Back. */
    pressBack: () => {
      length--;
      onPop();
    },
    flush: () => pending.splice(0).forEach((f) => f()),
    get length() {
      return length;
    },
  };
}

describe('back stack', () => {
  it('closes the top overlay on Back, one per press', () => {
    const f = fakeHistory();
    const s = createBackStack(f.h);
    f.listen(() => s.popped());
    const closed: string[] = [];
    s.open(() => closed.push('sheet'));
    s.open(() => closed.push('confirm'));
    expect(f.length).toBe(3);
    f.pressBack();
    expect(closed).toEqual(['confirm']);
    f.pressBack();
    expect(closed).toEqual(['confirm', 'sheet']);
    expect(s.depth).toBe(0);
    expect(f.length).toBe(1);
  });

  it('gives the entry back when an overlay closes another way, without taking that for a Back', () => {
    const f = fakeHistory();
    const s = createBackStack(f.h);
    f.listen(() => s.popped());
    const closed: string[] = [];
    s.open(() => closed.push('sheet'));
    const releaseConfirm = s.open(() => closed.push('confirm'));
    releaseConfirm();
    f.flush();
    expect(closed).toEqual([]);
    expect(f.length).toBe(2);
    // The next Back closes the sheet, not nothing.
    f.pressBack();
    expect(closed).toEqual(['sheet']);
  });

  it('does nothing when an overlay closed by Back releases its entry as it unmounts', () => {
    const f = fakeHistory();
    const s = createBackStack(f.h);
    f.listen(() => s.popped());
    let release = () => {};
    release = s.open(() => release());
    f.pressBack();
    f.flush();
    expect(f.length).toBe(1);
    expect(s.depth).toBe(0);
  });

  it('keeps the history and the stack the same depth through mixed closes', () => {
    const f = fakeHistory();
    const s = createBackStack(f.h);
    f.listen(() => s.popped());
    const a = s.open(() => a());
    const b = s.open(() => b());
    const c = s.open(() => c());
    b();
    f.pressBack(); // closes c
    f.flush();
    a();
    f.flush();
    expect(s.depth).toBe(0);
    expect(f.length).toBe(1);
  });
});
