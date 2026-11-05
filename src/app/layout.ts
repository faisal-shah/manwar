/**
 * Which app this page is: the wall (the tablet in the study, drawn on the
 * 1600x1000 canvas) or the phone companion (parents' phones, narrow, quick
 * actions). Both run on the same URL and the same household data; the
 * layout is chosen once per page load:
 *
 * 1. `?layout=wall|phone` in the URL (tests, screenshots);
 * 2. the choice stored on this device (pairing a phone stores 'phone', a
 *    wall signing in stores 'wall'; the layout switches store theirs);
 * 3. a device signed in as the household's wall (it remembers a household
 *    and is not a paired phone): a wall from before layouts were stored;
 * 4. otherwise the screen: a short side under 600 CSS px is a phone.
 *
 * Switching stores the choice and reloads, so the services a layout starts
 * (the wall's display schedule, wake lock, idle return) never mix.
 */
import { HOUSEHOLD_KEY } from '../data/householdKey';

export type Layout = 'wall' | 'phone';

const KEY = 'manwar.layout.v1';
const PHONE_MAX_SHORT_SIDE = 600;

const isLayout = (v: unknown): v is Layout => v === 'wall' || v === 'phone';

/** The rule above, pure (unit-tested). `signedInAsWall`: what rule 3 asks. */
export function chooseLayout(param: string | null, stored: string | null, signedInAsWall: boolean, shortSide: number): Layout {
  if (isLayout(param)) return param;
  if (isLayout(stored)) return stored;
  if (signedInAsWall) return 'wall';
  return phoneSized(shortSide) ? 'phone' : 'wall';
}

/** Rule 4: a screen whose short side is under 600 CSS px is a phone's. */
export const phoneSized = (shortSide: number) => shortSide < PHONE_MAX_SHORT_SIDE;

/** This device's screen, by rule 4. */
export const screenShortSide = () => Math.min(window.screen.width, window.screen.height);

function storedLayout(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Whether this device remembers a household it opened as the wall (not as a paired phone). */
function signedInAsWall(): boolean {
  try {
    const h = JSON.parse(localStorage.getItem(HOUSEHOLD_KEY) ?? 'null') as { hid?: unknown; device?: unknown } | null;
    return typeof h?.hid === 'string' && h.device === undefined;
  } catch {
    return false;
  }
}

export const layout: Layout =
  typeof window === 'undefined'
    ? 'wall'
    : chooseLayout(new URLSearchParams(location.search).get('layout'), storedLayout(), signedInAsWall(), screenShortSide());

export const isPhone = layout === 'phone';

/** Remember `next` for this device and reload into it (a no-op when it is the current one and stored). */
export function switchLayout(next: Layout): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* no storage: the screen decides next time */
  }
  const url = new URL(location.href);
  url.searchParams.delete('layout');
  if (next !== layout || url.href !== location.href) location.replace(url.href);
}

/** Remember the layout without reloading (pairing on a phone, a wall signing in): the page already is that one. */
export function rememberLayout(next: Layout): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* no storage: the screen decides next time */
  }
}
