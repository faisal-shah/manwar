import { computed, signal } from '@preact/signals';
import { pinChange } from '../data/settings';
import { pairedDevice } from '../data/session';
import { saveSettings, settings } from '../data/store';
import { currentTime, nowMs } from '../lib/clock';
import { onActivity } from './activity';
import { pinPause } from './pin';

/**
 * Parental lock. With a PIN set, the tablet is in kid mode: anyone can look
 * around and check off tasks; adding, editing, deleting, giving stars and
 * redeeming need the PIN. A correct PIN unlocks until the tablet has been
 * idle for `relockMinutes`. A paired phone belongs to a parent (only the
 * wall pairs phones, behind the PIN), so it never asks.
 */

export const lockEnabled = computed(() => !pairedDevice() && !!settings.value.lock.pinHash);
const unlockedUntil = signal(0);
export const unlocked = computed(() => !lockEnabled.value || nowMs.value < unlockedUntil.value);

/** The PIN pad host reads this; requireParent() fills it. */
export const pinRequest = signal<{ resolve: (ok: boolean) => void; reason?: string } | null>(null);

async function hash(salt: string, pin: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function extend() {
  unlockedUntil.value = currentTime() + settings.value.lock.relockMinutes * 60_000;
}

/*
 * Wrong PINs in a row and the pause they earned, kept in this tablet's
 * storage: a kid who reloads the page (or waits for the nightly reload)
 * gets neither a fresh pad nor a reset count.
 */
const PAUSE_KEY = 'manwar.pinPause.v1';
type PauseState = { wrong: number; until: number };

function loadPause(): PauseState {
  try {
    const v = JSON.parse(localStorage.getItem(PAUSE_KEY) ?? 'null') as Partial<PauseState> | null;
    return { wrong: Number(v?.wrong) || 0, until: Number(v?.until) || 0 };
  } catch {
    return { wrong: 0, until: 0 };
  }
}

function storePause(p: PauseState): void {
  try {
    if (p.wrong) localStorage.setItem(PAUSE_KEY, JSON.stringify(p));
    else localStorage.removeItem(PAUSE_KEY);
  } catch {
    // No storage (private mode): the pause lasts until a reload.
  }
}

const stored = typeof window === 'undefined' ? { wrong: 0, until: 0 } : loadPause();
let wrongPins = stored.wrong;
/** The PIN pad refuses entries until this instant (after repeated wrong PINs). */
export const pinPausedUntil = signal(stored.until);

export async function checkPin(pin: string): Promise<boolean> {
  const { pinHash, salt } = settings.value.lock;
  if (!pinHash || !salt) return true;
  if (currentTime() < pinPausedUntil.value) return false;
  const ok = (await hash(salt, pin)) === pinHash;
  if (ok) {
    wrongPins = 0;
    extend();
  } else {
    const pause = pinPause(++wrongPins);
    if (pause) pinPausedUntil.value = currentTime() + pause;
  }
  storePause({ wrong: wrongPins, until: pinPausedUntil.value });
  return ok;
}

/** Resolves true once a parent has entered the PIN (immediately when unlocked or no PIN). */
export function requireParent(reason?: string): Promise<boolean> {
  if (unlocked.value) {
    if (lockEnabled.value) extend();
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    pinRequest.value = {
      reason,
      resolve: (ok) => {
        pinRequest.value = null;
        resolve(ok);
      },
    };
  });
}

/** Run `fn` only after parent confirmation. */
export async function asParent(fn: () => unknown, reason?: string): Promise<void> {
  if (await requireParent(reason)) await fn();
}

/** Set or remove the PIN. Writes only the PIN fields, so another tablet's relock minutes stay. */
export async function setPin(pin: string | null): Promise<void> {
  if (!pin) return saveSettings(pinChange(null));
  if (!/^\d{4}$/.test(pin)) throw new Error('The PIN must be 4 digits.');
  const salt = crypto.randomUUID();
  const pinHash = await hash(salt, pin);
  // Stay unlocked from the moment the lock turns on, not from the server's ack.
  extend();
  await saveSettings(pinChange({ salt, pinHash }));
}

export function lockNow(): void {
  unlockedUntil.value = 0;
}

/** Any touch or key press while unlocked keeps it unlocked. */
export function startRelock(): void {
  onActivity(() => {
    if (lockEnabled.peek() && currentTime() < unlockedUntil.peek()) extend();
  });
}
