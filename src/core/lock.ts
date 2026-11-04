import { computed, signal } from '@preact/signals';
import { saveSettings, settings } from '../data/store';
import { currentTime, nowMs } from '../lib/clock';

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

export async function checkPin(pin: string): Promise<boolean> {
  const { pinHash, salt } = settings.value.lock;
  if (!pinHash || !salt) return true;
  const ok = (await hash(salt, pin)) === pinHash;
  if (ok) extend();
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
    await saveSettings({ lock: { relockMinutes: settings.value.lock.relockMinutes } });
    return;
  }
  if (!/^\d{4}$/.test(pin)) throw new Error('The PIN must be 4 digits.');
  const salt = crypto.randomUUID();
  await saveSettings({ lock: { ...settings.value.lock, salt, pinHash: await hash(salt, pin) } });
  extend();
}

export function lockNow(): void {
  unlockedUntil.value = 0;
}

/** Any touch while unlocked keeps it unlocked. */
export function trackActivity(): void {
  window.addEventListener(
    'pointerdown',
    () => {
      if (lockEnabled.value && nowMs.value < unlockedUntil.value) extend();
    },
    { capture: true, passive: true },
  );
}
