/**
 * Which app this page is: the wall (the tablet in the study, drawn on the
 * 1600x1000 canvas) or the phone companion (parents' phones, narrow, quick
 * actions). Both run on the same URL and the same household data; the
 * layout is chosen once per page load:
 *
 * 1. `?layout=wall|phone` in the URL (tests, screenshots);
 * 2. the choice stored on this device (pairing a phone stores 'phone';
 *    More > Use as the wall, or the sign-in screen's switch, store theirs);
 * 3. otherwise the screen: a short side under 600 CSS px is a phone.
 *
 * Switching stores the choice and reloads, so the services a layout starts
 * (the wall's display schedule, wake lock, idle return) never mix.
 */
export type Layout = 'wall' | 'phone';

const KEY = 'manwar.layout.v1';
const PHONE_MAX_SHORT_SIDE = 600;

const isLayout = (v: unknown): v is Layout => v === 'wall' || v === 'phone';

/** The rule above, pure (unit-tested). */
export function chooseLayout(param: string | null, stored: string | null, shortSide: number): Layout {
  if (isLayout(param)) return param;
  if (isLayout(stored)) return stored;
  return shortSide < PHONE_MAX_SHORT_SIDE ? 'phone' : 'wall';
}

function storedLayout(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const layout: Layout =
  typeof window === 'undefined'
    ? 'wall'
    : chooseLayout(
        new URLSearchParams(location.search).get('layout'),
        storedLayout(),
        Math.min(window.screen.width, window.screen.height),
      );

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

/** Remember the phone layout without reloading (pairing, on a page that already is one). */
export function rememberLayout(next: Layout): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* no storage: the screen decides next time */
  }
}
