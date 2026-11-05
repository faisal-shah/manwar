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
 * (battery saver); either way it is taken again.
 */
export function holdWakeLock(): void {
  if (!('wakeLock' in navigator)) return;
  let held: WakeLockSentinel | null = null;
  const acquire = () => {
    if (held || document.visibilityState !== 'visible') return;
    navigator.wakeLock
      .request('screen')
      .then((s) => {
        held = s;
        s.addEventListener('release', () => {
          held = null;
          setTimeout(acquire, REACQUIRE_MS);
        });
      })
      .catch(() => setTimeout(acquire, REACQUIRE_MS * 12));
  };
  acquire();
  document.addEventListener('visibilitychange', acquire);
}
