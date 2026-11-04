import { effect } from '@preact/signals';
import { registerSW } from 'virtual:pwa-register';
import { startCalendarSync } from '../calendar/engine';
import { startDisplay } from '../core/display';
import { holdWakeLock } from '../core/kiosk';
import { trackActivity } from '../core/lock';
import { startWeather } from '../core/weather';
import { seedIfEmpty } from '../data/seed';
import { ready } from '../data/store';
import { session } from '../data/session';
import { startIdleReturn } from './nav';

/** Background services, started once the household is open. */
export function startApp(): void {
  startDisplay();
  holdWakeLock();
  trackActivity();
  let started = false;
  effect(() => {
    if (session.value.state !== 'signedIn' || !ready.value || started) return;
    started = true;
    void seedIfEmpty();
    startCalendarSync();
    startWeather();
    startIdleReturn();
  });
  startUpdates();
}

const IDLE_MS = 2 * 60_000;
const CHECK_MS = 30 * 60_000;

/**
 * New deploys. The service worker checks for a new version every 30 minutes;
 * once one is waiting it is applied (page reload) as soon as nothing would be
 * interrupted: right away before sign-in, otherwise after two idle minutes
 * with no sheet, dialog, popover or running timer on screen.
 */
function startUpdates(): void {
  let waiting = false;
  let lastTouch = Date.now();
  window.addEventListener('pointerdown', () => (lastTouch = Date.now()), { capture: true, passive: true });
  const safe = () =>
    session.value.state !== 'signedIn' || (Date.now() - lastTouch > IDLE_MS && !document.querySelector('[role="dialog"]'));
  const tryApply = () => {
    if (waiting && safe()) void update(true);
  };
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
      tryApply();
    },
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => void reg.update(), CHECK_MS);
    },
  });
  setInterval(tryApply, 30_000);
}
