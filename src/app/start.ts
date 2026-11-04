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
  // New deploys apply on the next reload; the wall reloads itself at 3 AM.
  const update = registerSW({ immediate: true });
  setInterval(() => {
    if (new Date().getHours() === 3) void update(true);
  }, 60 * 60_000);
}
