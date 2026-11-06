import { effect } from '@preact/signals';
import { registerSW } from 'virtual:pwa-register';
import { startCalendarSync } from '../calendar/engine';
import { followDisplayCommands, startDisplay } from '../core/display';
import { holdWakeLock } from '../core/kiosk';
import { idleFor, trackActivity } from '../core/activity';
import { startRelock } from '../core/lock';
import { keepFieldAboveKeyboard, keepScaleWithKeyboard } from '../core/viewport';
import { startWeather } from '../core/weather';
import { seedIfEmpty } from '../data/seed';
import { keepGroceryMemory } from '../features/lists/memory';
import { ready, unsentWrites } from '../data/store';
import { prayerBusy } from './face';
import { movePlace } from './migrate';
import { googleBusy, reconnectNote, session } from '../data/session';
import { holdSleepForTimer } from '../features/timer/state';
import { startPhoneTheme } from '../phone/theme';
import { startBack } from '../ui/back';
import { toast } from '../ui/overlays';
import { isPhone } from './layout';
import { startIdleReturn } from './nav';

/**
 * Background services. The wall runs its display schedule, wake lock, idle
 * return, the weather, the first-run seed and the prayer clock; a phone only
 * follows the household (the wall seeds it) and the phone's own light or
 * dark setting.
 */
export function startApp(): void {
  trackActivity();
  if (isPhone) {
    startPhoneTheme();
    startBack();
    keepFieldAboveKeyboard();
  } else {
    keepScaleWithKeyboard();
    startDisplay();
    startRelock();
    holdWakeLock();
  }
  // A reconnect's result, on the page Google's redirect came back to.
  effect(() => {
    const note = reconnectNote.value;
    if (!note) return;
    reconnectNote.value = null;
    toast(note);
  });
  let started = false;
  effect(() => {
    if (session.value.state !== 'signedIn' || !ready.value || started) return;
    started = true;
    startCalendarSync();
    if (isPhone) return;
    void movePlace();
    startWeather();
    // The grocery suggestions start from what the lists hold once a household's first-run seed is in.
    void seedIfEmpty()
      .catch((e: unknown) => console.warn('first-run seed failed', e))
      .then(keepGroceryMemory);
    startIdleReturn();
    holdSleepForTimer();
    followDisplayCommands();
    loadPrayer();
  });
  startUpdates();
}

const PRAYER_RETRY_MS = 15_000;
const PRAYER_TRIES = 4;

/**
 * The prayer face runs on the wall only: a phone never loads the clock or
 * its rules (their code and fonts are in the precache, so a wall updated
 * while offline still has them; the media is not). A module that does not
 * load is tried again, backing off; a browser may keep a failed import for
 * the page's life, so after the last try the page reloads once nothing would
 * be interrupted (without the module no athan sounds).
 */
function loadPrayer(attempt = 1): void {
  import('../prayer/start')
    .then((m) => m.startPrayer())
    .catch((e: unknown) => {
      console.warn(`prayer clock did not load (try ${attempt} of ${PRAYER_TRIES})`, e);
      if (attempt < PRAYER_TRIES) setTimeout(() => loadPrayer(attempt + 1), PRAYER_RETRY_MS * 4 ** (attempt - 1));
      else reloadWanted = true;
    });
}

const IDLE_MS = 2 * 60_000;
const CHECK_MS = 30 * 60_000;
/** A reload asked for outside a new deploy (the prayer module did not load); applied as safely as an update. */
let reloadWanted = false;

/**
 * New deploys. The service worker checks for a new version every 30 minutes;
 * once one is waiting it is applied (page reload) as soon as nothing would be
 * interrupted: never while a Google connection is under way (googleBusy),
 * right away before sign-in, otherwise after two idle minutes
 * with no sheet, dialog, popover or running timer on screen (a note on the
 * wall is no reason to wait: it shows again, not announced again), nothing on
 * the prayer face a reload would cut short (the athan sequence now or within
 * three minutes, its settings, a preview: prayer/rules.ts), and no change
 * made here still on its way to the server (a phone keeps those in memory
 * only, so a reload would lose them).
 */
function startUpdates(): void {
  let waiting = false;
  const safe = () =>
    !googleBusy.peek() &&
    (session.value.state !== 'signedIn' ||
      (idleFor() > IDLE_MS &&
        !document.querySelector('[role="dialog"]:not(.message-layer)') &&
        unsentWrites.peek() === 0 &&
        !prayerBusy.peek()));
  const tryApply = () => {
    if (!safe()) return;
    if (waiting) void update(true);
    else if (reloadWanted) location.reload();
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
