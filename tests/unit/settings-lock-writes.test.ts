import { describe, expect, it, vi } from 'vitest';
import type { Settings, SettingsPatch } from '../../src/data/types';

/**
 * The parental lock's writes from a tablet whose copy of the settings is
 * stale (another tablet changed them since it last heard). Each write goes
 * through a stand-in for Firestore's merge, so a write that sent this
 * tablet's whole lock map would bring back another tablet's old values: an
 * old PIN hash, or relock minutes changed since.
 */

vi.mock('firebase/firestore', () => ({
  arrayUnion: (...values: unknown[]) => ({ op: 'union', values }),
  arrayRemove: (...values: unknown[]) => ({ op: 'remove', values }),
  deleteField: () => ({ op: 'delete' }),
}));

const doc = vi.hoisted(() => ({ stored: {} as Record<string, unknown> }));

function merge(into: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...into };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && (v as { op?: string }).op === 'delete') delete out[k];
    else if (v && typeof v === 'object' && !Array.isArray(v))
      out[k] = merge((out[k] as Record<string, unknown>) ?? {}, v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

vi.mock('../../src/data/store', async () => {
  const { signal } = await import('@preact/signals');
  const { DEFAULT_SETTINGS } = await import('../../src/data/settings');
  return {
    /** This tablet's copy, set by each test. */
    settings: signal<Settings>(DEFAULT_SETTINGS),
    saveSettings: async (p: SettingsPatch) => void (doc.stored = merge(doc.stored, p as Record<string, unknown>)),
  };
});

const { mergeSettings, pinChange, relockChange, windowChange } = await import('../../src/data/settings');
const { settings, saveSettings } = await import('../../src/data/store');
const { setPin, checkPin } = await import('../../src/core/lock');

const read = () => mergeSettings(doc.stored as Partial<Settings>);

describe('lock writes from a stale copy', () => {
  it('setting a PIN keeps the relock minutes another tablet chose', async () => {
    doc.stored = {};
    settings.value = read();
    // The hall tablet changes the relock time; the kitchen has not heard yet.
    await saveSettings(relockChange(7));
    await setPin('2468');
    expect(read().lock.relockMinutes).toBe(7);
    expect(read().lock.pinHash).toBeTruthy();
  });

  it('removing the PIN keeps the relock minutes and leaves no hash behind', async () => {
    doc.stored = {};
    await setPin('2468');
    settings.value = read();
    await saveSettings(relockChange(9));
    await setPin(null);
    expect(read().lock).toEqual({ relockMinutes: 9 });
  });

  it('changing the relock minutes does not bring back an old PIN', async () => {
    doc.stored = {};
    await setPin('1111');
    // The kitchen's copy has the PIN 1111; the hall tablet changes it to 2468.
    settings.value = read();
    const kitchen = settings.value;
    await setPin('2468');
    settings.value = kitchen;
    await saveSettings(relockChange(4));
    settings.value = read();
    expect(read().lock.relockMinutes).toBe(4);
    expect(await checkPin('1111')).toBe(false);
    expect(await checkPin('2468')).toBe(true);
  });

  it('writes only the lock fields it changes', () => {
    expect(relockChange(3)).toEqual({ lock: { relockMinutes: 3 } });
    expect(pinChange({ salt: 's', pinHash: 'h' })).toEqual({ lock: { salt: 's', pinHash: 'h' } });
    expect(pinChange(null)).toEqual({ lock: { salt: { op: 'delete' }, pinHash: { op: 'delete' } } });
  });
});

describe('night and sleep windows from a stale copy', () => {
  it('a change names only the fields it changes', () => {
    expect(windowChange('night', { enabled: true })).toEqual({ night: { enabled: true } });
    expect(windowChange('sleep', { from: '21:00' })).toEqual({ sleep: { from: '21:00' } });
  });

  it('keeps the other tablet’s From when this one changes To', async () => {
    doc.stored = {};
    await saveSettings(windowChange('sleep', { from: '21:15' }));
    await saveSettings(windowChange('sleep', { to: '05:45' }));
    await saveSettings(windowChange('sleep', { enabled: true }));
    expect(read().sleep).toEqual({ enabled: true, from: '21:15', to: '05:45' });
    await saveSettings(windowChange('night', { enabled: true }));
    await saveSettings(windowChange('night', { to: '07:00' }));
    expect(read().night).toEqual({ enabled: true, from: '20:30', to: '07:00' });
  });
});
