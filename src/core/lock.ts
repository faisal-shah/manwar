import { computed, signal } from '@preact/signals';
import { deleteField } from 'firebase/firestore';
import { saveSettings, settings } from '../data/store';
import type { Settings } from '../data/types';
import { currentTime, nowMs } from '../lib/clock';
import { onActivity } from './activity';
import { pinPause } from './pin';

/**
 * Parental lock. With a PIN set, the tablet is in kid mode: anyone can look
 * around and check off tasks; adding, editing, deleting, giving stars and
 * redeeming need the PIN. A correct PIN unlocks until the tablet has been
 * idle for `relockMinutes`.
 */

export const lockEnabled = computed(() => !!settings.value.lock.pinHash);
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

let wrongPins = 0;
/** The PIN pad refuses entries until this instant (after repeated wrong PINs). */
export const pinPausedUntil = signal(0);

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

export async function setPin(pin: string | null): Promise<void> {
  if (!pin) {
    // saveSettings merges nested maps, so the PIN fields must be deleted explicitly.
    const lock = { relockMinutes: settings.value.lock.relockMinutes, pinHash: deleteField(), salt: deleteField() };
    await saveSettings({ lock: lock as unknown as Settings['lock'] });
    return;
  }
  if (!/^\d{4}$/.test(pin)) throw new Error('The PIN must be 4 digits.');
  const salt = crypto.randomUUID();
  const pinHash = await hash(salt, pin);
  // Stay unlocked from the moment the lock turns on, not from the server's ack.
  extend();
  await saveSettings({ lock: { ...settings.value.lock, salt, pinHash } });
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
