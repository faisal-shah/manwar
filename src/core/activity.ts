import { currentTime } from '../lib/clock';

/**
 * Touches and key presses on the wall. Idle return, the parental relock, the
 * sleep wake and the update check all read this one source. Typing counts:
 * the on-screen keyboard sends key and input events but no pointer events, so
 * a parent typing a long note is not idle.
 */
const EVENTS = ['pointerdown', 'keydown', 'input'] as const;

let last = currentTime();
const listeners: (() => void)[] = [];
let tracking = false;

export function trackActivity(): void {
  if (tracking) return;
  tracking = true;
  const mark = () => {
    last = currentTime();
    for (const fn of listeners) fn();
  };
  for (const type of EVENTS) window.addEventListener(type, mark, { capture: true, passive: true });
}

/** Run `fn` on every touch or key press (in the capture phase, before the target's handlers). */
export function onActivity(fn: () => void): void {
  listeners.push(fn);
}

/** Milliseconds since the last touch or key press (or since the page loaded). */
export const idleFor = () => currentTime() - last;
