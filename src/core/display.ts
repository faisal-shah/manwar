import { computed, effect, signal } from '@preact/signals';
import { data, newId, put, settings, settingsLoaded } from '../data/store';
import { currentTime, now } from '../lib/clock';
import { minutesOfDay } from '../lib/date';
import { onActivity } from './activity';
import { setBrightness, wakeScreen } from './kiosk';
import { asleepAt, inWindow, sleepNowEnd, WAKE_MS } from './sleep';

/**
 * Display states: day (light), night (dark theme, dimmed) and sleep (black,
 * backlight off). Night and sleep follow their daily windows; "Sleep now"
 * forces sleep until the next wake time; a tap during sleep wakes the screen
 * and it stays awake until nobody has touched it for a few minutes; a
 * running timer holds scheduled sleep off, and a timer started during Sleep
 * now ends it (the rule itself: core/sleep.ts).
 */

const FORCED_KEY = 'manwar.sleepUntil.v1';

function loadForced(): number {
  try {
    return Number(localStorage.getItem(FORCED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Sleep forced on until this instant ("Sleep now"). Kept in localStorage, so
 * a reload in the night (an update, the kiosk browser restarting) does not
 * turn the screen back on.
 */
export const sleepForcedUntil = signal(typeof localStorage !== 'undefined' ? loadForced() : 0);
/** Awake until this instant: a tap on the sleep screen, then each touch while awake, keeps it on. */
export const wokenUntil = signal(0);
/** Scheduled sleep waits until this instant (a running timer holds it to 5 minutes past its end). */
export const sleepHeldUntil = signal(0);
/** Manual theme override for this session, null = follow the schedule. `?theme=dark` sets it (screenshots, tests). */
const themeParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('theme') : null;
export const themeOverride = signal<'light' | 'dark' | null>(themeParam === 'dark' || themeParam === 'light' ? themeParam : null);

export const sleeping = computed(() =>
  asleepAt(
    now.value.getTime(),
    { wokenUntil: wokenUntil.value, forcedUntil: sleepForcedUntil.value, heldUntil: sleepHeldUntil.value },
    settings.value.sleep,
  ),
);

export const theme = computed<'light' | 'dark'>(() => {
  if (themeOverride.value) return themeOverride.value;
  return inWindow(settings.value.night, minutesOfDay(now.value)) || sleeping.value ? 'dark' : 'light';
});

/** Sleep until the end of the sleep window (or until 7:00 without one). */
export function sleepNow(): void {
  wokenUntil.value = 0;
  sleepForcedUntil.value = sleepNowEnd(settings.value.sleep, currentTime());
}

export function wake(): void {
  sleepForcedUntil.value = 0;
  wokenUntil.value = currentTime() + WAKE_MS;
  wakeScreen();
}

/** End "Sleep now" for a timer started meanwhile (from a phone): the wall shows it, and its hold keeps scheduled sleep off. */
export function endForcedSleep(): void {
  if (sleepForcedUntil.peek() <= currentTime()) return;
  sleepForcedUntil.value = 0;
  wakeScreen();
}

export function startDisplay(): void {
  // Someone using the wall keeps it awake: scheduled sleep starts only after
  // WAKE_MS without a touch. A touch on the sleep screen itself wakes it
  // through wake(), and "Sleep now" (a touch too) clears this hold.
  onActivity(() => {
    if (!sleeping.peek()) wokenUntil.value = Math.max(wokenUntil.peek(), currentTime() + WAKE_MS);
  });
  effect(() => {
    const until = sleepForcedUntil.value;
    try {
      if (until > currentTime()) localStorage.setItem(FORCED_KEY, String(until));
      else localStorage.removeItem(FORCED_KEY);
    } catch {
      /* storage unavailable: forced sleep lasts for this page load only */
    }
  });
  effect(() => {
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.dataset.text = settings.value.textScale;
  });
  effect(() => {
    // The windows come with the household's settings. Until they load, the backlight stays as the last
    // page left it, so a reload at night (an update, the kiosk browser restarting) does not light the room.
    if (!settingsLoaded.value) return;
    setBrightness(sleeping.value ? 0 : theme.value === 'dark' ? 30 : 100);
  });
}

/*
 * Sleep and wake from a phone. The phone writes `commands/display`; every
 * wall applies each command once (it remembers the last one it saw), and
 * only a recent one: a wall that was off when a parent tapped "Sleep" does
 * not go dark hours later when it starts.
 */
const COMMAND_KEY = 'manwar.displayCommand.v1';
export const COMMAND_FRESH_MS = 10 * 60_000;

/** Ask the wall(s) to sleep now or wake up. */
export function sendDisplayCommand(kind: 'sleep' | 'wake', by?: string): void {
  void put('commands', { id: 'display', kind, nonce: newId(), at: currentTime(), by });
}

/** The wall's side: apply each new display command. Started once the household is open. */
export function followDisplayCommands(): void {
  let seen: string | null = null;
  try {
    seen = localStorage.getItem(COMMAND_KEY);
  } catch {
    /* storage unavailable: a reload may apply the last command again, if still recent */
  }
  effect(() => {
    const c = data.commands.value.find((x) => x.id === 'display');
    if (!c || c.nonce === seen) return;
    seen = c.nonce;
    try {
      localStorage.setItem(COMMAND_KEY, c.nonce);
    } catch {
      /* as above */
    }
    if (Math.abs(currentTime() - c.at) > COMMAND_FRESH_MS) return;
    if (c.kind === 'sleep') sleepNow();
    else wake();
  });
}
