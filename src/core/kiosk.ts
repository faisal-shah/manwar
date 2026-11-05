/**
 * Tablet integration. Fully Kiosk Browser exposes `window.fully` when its
 * JavaScript Interface is enabled; elsewhere these calls are no-ops.
 */
interface FullyApi {
  setScreenBrightness(level: number): void;
  turnScreenOn(): void;
}

declare global {
  interface Window {
    fully?: FullyApi;
  }
}

export const underFully = () => typeof window.fully?.setScreenBrightness === 'function';

let lastBrightness = -1;

/** Backlight 0..100 (Fully maps 0..255). */
export function setBrightness(percent: number): void {
  if (!underFully() || percent === lastBrightness) return;
  lastBrightness = percent;
  window.fully!.setScreenBrightness(Math.round((percent / 100) * 255));
}

export function wakeScreen(): void {
  window.fully?.turnScreenOn();
}

const REACQUIRE_MS = 5000;

/**
 * Keeps the display on in plain Chrome. The browser drops the lock when the
 * page is hidden, and the system may drop it while the page stays visible
 * (battery saver); either way it is taken again. One request at a time and
 * one retry waiting, however often the page shows: a browser that keeps
 * refusing is asked once a minute.
 */
export function holdWakeLock(): void {
  if (!('wakeLock' in navigator)) return;
  let held: WakeLockSentinel | null = null;
  let asking = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const later = (ms: number) => {
    clearTimeout(retry);
    retry = setTimeout(acquire, ms);
  };
  const acquire = () => {
    if (held || asking || document.visibilityState !== 'visible') return;
    asking = true;
    navigator.wakeLock
      .request('screen')
      .then((s) => {
        held = s;
        s.addEventListener('release', () => {
          held = null;
          later(REACQUIRE_MS);
        });
      })
      .catch(() => later(REACQUIRE_MS * 12))
      .finally(() => (asking = false));
  };
  acquire();
  document.addEventListener('visibilitychange', acquire);
}
