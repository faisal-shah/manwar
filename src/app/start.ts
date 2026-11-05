import { effect } from '@preact/signals';
import { registerSW } from 'virtual:pwa-register';
import { startCalendarSync } from '../calendar/engine';
import { followDisplayCommands, startDisplay } from '../core/display';
import { holdWakeLock } from '../core/kiosk';
import { idleFor, trackActivity } from '../core/activity';
import { startRelock } from '../core/lock';
import { keepScaleWithKeyboard } from '../core/viewport';
import { startWeather } from '../core/weather';
import { seedIfEmpty } from '../data/seed';
import { ready } from '../data/store';
import { session } from '../data/session';
import { holdSleepForTimer } from '../features/timer/state';
import { startPhoneTheme } from '../phone/theme';
import { isPhone } from './layout';
import { startIdleReturn } from './nav';

/**
 * Background services. The wall runs its display schedule, wake lock, idle
 * return and the first-run seed; a phone only follows the household (the
 * wall seeds it) and the phone's own light or dark setting.
 */
export function startApp(): void {
  trackActivity();
  if (isPhone) startPhoneTheme();
  else {
    keepScaleWithKeyboard();
    startDisplay();
    startRelock();
    holdWakeLock();
  }
  let started = false;
  effect(() => {
    if (session.value.state !== 'signedIn' || !ready.value || started) return;
    started = true;
    startCalendarSync();
    startWeather();
    if (isPhone) return;
    void seedIfEmpty();
    startIdleReturn();
    holdSleepForTimer();
    followDisplayCommands();
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
  const safe = () => session.value.state !== 'signedIn' || (idleFor() > IDLE_MS && !document.querySelector('[role="dialog"]'));
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
      // Offline, the check rejects; the next one retries.
      if (reg) setInterval(() => void reg.update().catch(() => {}), CHECK_MS);
    },
  });
  setInterval(tryApply, 30_000);
}
