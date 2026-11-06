/**
 * Touches and key presses on the wall (or phone). Idle return, the parental
 * relock, the sleep wake, the update check, the prayer face's resting rule
 * and a phone's last-seen stamp all read this one source. Typing counts:
 * the on-screen keyboard sends key and input events but no pointer events, so
 * a parent typing a long note is not idle.
 */
const EVENTS = ['pointerdown', 'keydown', 'input'] as const;

/** On the monotonic clock (performance.now()): a wall clock set back an hour must not make the wall look busy for that hour. */
let last = performance.now();
const listeners: (() => void)[] = [];
let tracking = false;

export function trackActivity(): void {
  if (tracking) return;
  tracking = true;
  const mark = () => {
    last = performance.now();
    for (const fn of listeners) fn();
  };
  for (const type of EVENTS) window.addEventListener(type, mark, { capture: true, passive: true });
}

/** Run `fn` on every touch or key press (in the capture phase, before the target's handlers). Returns the off switch. */
export function onActivity(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** Milliseconds since the last touch or key press (or since the page loaded). */
export const idleFor = () => performance.now() - last;
