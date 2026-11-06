import { signal } from '@preact/signals';
import { currentTime } from '../../lib/clock';

/**
 * The prayer clock's time: the app's clock (lib/clock.ts, which `?now=`
 * pins for tests and screenshots), run faster by `?speed=60` (the prayer
 * clock only), or moved by a settings preview to just before an athan.
 */
let anchorReal = currentTime();
let anchorVirtual = anchorReal;

const asked = Number(new URLSearchParams(globalThis.location?.search ?? '').get('speed'));

/** How fast the clock runs: 1, `?speed=`, or a preview's fast-forward. */
export const speed = signal(Number.isFinite(asked) && asked > 0 ? asked : 1);

/** True while a settings preview has moved the clock (`?now=` and `?speed=` are dev tools, not previews). */
export const previewing = signal(false);
let run = 0;

/** Which preview the clock is in, or 0 on the real clock: what sounded in one preview has not sounded in another, or for real. */
export const previewRun = () => (previewing.value ? run : 0);

export function now(): Date {
  return new Date(anchorVirtual + (currentTime() - anchorReal) * speed.peek());
}

/** Change the rate of the clock from this moment on (previews fast-forward). */
export function setSpeed(n: number): void {
  anchorVirtual = now().getTime();
  anchorReal = currentTime();
  speed.value = n;
}

/** Jump to `t` (a preview), or back to the real clock at its own rate with null. */
export function travelTo(t: Date | null): void {
  anchorReal = currentTime();
  anchorVirtual = t ? t.getTime() : anchorReal;
  if (t) run++;
  else speed.value = 1;
  previewing.value = t !== null;
}
