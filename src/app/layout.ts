/**
 * Which app this page is: the wall (the tablet in the study, drawn on the
 * 1600x1000 canvas) or the phone companion (parents' phones, narrow, quick
 * actions). Both run on the same URL and the same household data; the
 * layout is chosen once per page load:
 *
 * 1. `?layout=wall|phone` in the URL (tests, screenshots);
 * 2. a choice made on this device (This phone > Use the wall layout,
 *    Settings > About > Use the phone layout, the pairing screen's This
 *    is the wall);
 * 3. a paired phone is a phone;
 * 4. Fully Kiosk Browser (the wall's, with its JavaScript Interface on)
 *    is a wall;
 * 5. the screen: a short side under 480 CSS px is a phone's, whatever the
 *    device signed in as (no wall tablet is that small); under 600 too,
 *    unless the device opened the household as the wall (a small tablet,
 *    or one whose display size was made larger); otherwise a wall.
 *
 * Only a choice is stored (2): what the device signed in as follows its
 * session, so a phone once signed in with the household's Google account
 * is still a phone. Switching stores the choice and reloads, so the
 * services a layout starts (the wall's display schedule, wake lock, idle
 * return) never mix.
 */
import { HOUSEHOLD_KEY } from '../data/householdKey';
import { underFully } from '../core/kiosk';

export type Layout = 'wall' | 'phone';

const KEY = 'manwar.layout.v2';
/** Below this, a screen is a phone's whatever else the device says. */
const PHONE_SHORT_SIDE = 480;
/** Below this, a screen is a phone's unless the device opened the household as the wall. */
const PHONE_MAX_SHORT_SIDE = 600;

const isLayout = (v: unknown): v is Layout => v === 'wall' || v === 'phone';

/** What chooses the layout (the rule above). */
export interface LayoutSignals {
  /** `?layout=` in the URL. */
  param: string | null;
  /** The choice stored on this device. */
  chosen: string | null;
  /** How this device last opened the household: as a paired phone, as the wall, or not at all. */
  openedAs: 'paired' | 'wall' | null;
  /** Running in Fully Kiosk Browser. */
  fully: boolean;
  /** The screen's short side, in CSS px. */
  shortSide: number;
}

/** The rule above, pure (unit-tested). */
export function chooseLayout({ param, chosen, openedAs, fully, shortSide }: LayoutSignals): Layout {
  if (isLayout(param)) return param;
  if (isLayout(chosen)) return chosen;
  if (openedAs === 'paired') return 'phone';
  if (fully) return 'wall';
  if (shortSide < PHONE_SHORT_SIDE) return 'phone';
  return phoneSized(shortSide) && openedAs !== 'wall' ? 'phone' : 'wall';
}

/** A screen whose short side is under 600 CSS px could be a phone's. */
export const phoneSized = (shortSide: number) => shortSide < PHONE_MAX_SHORT_SIDE;

/** This device's screen, for the rule. */
export const screenShortSide = () => Math.min(window.screen.width, window.screen.height);

function storedLayout(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** How this device last opened the household (its remembered claims). */
function openedAs(): LayoutSignals['openedAs'] {
  try {
    const h = JSON.parse(localStorage.getItem(HOUSEHOLD_KEY) ?? 'null') as { hid?: unknown; device?: unknown } | null;
    if (typeof h?.hid !== 'string') return null;
    return h.device === undefined ? 'wall' : 'paired';
  } catch {
    return null;
  }
}

export const layout: Layout =
  typeof window === 'undefined'
    ? 'wall'
    : chooseLayout({
        param: new URLSearchParams(location.search).get('layout'),
        chosen: storedLayout(),
        openedAs: openedAs(),
        fully: underFully(),
        shortSide: screenShortSide(),
      });

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
