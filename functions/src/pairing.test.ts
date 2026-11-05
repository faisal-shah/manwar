import { describe, expect, it } from 'vitest';
import { PAIR_ALPHABET, PAIR_CODE_LENGTH, codeFromBytes, deviceName, deviceUid, isDeviceId, normalizeCode } from './pairing.js';

describe('pairing codes', () => {
  it('draws eight characters from the alphabet, skipping bytes past the last whole round', () => {
    const bytes = Uint8Array.from([0, 30, 31, 247, 248, 255, 1, 2, 3, 4, 5]);
    // 248 = 8 x 31 and above are skipped; 31 wraps to the first character.
    expect(codeFromBytes(bytes)).toBe('2Z2Z3456');
    expect(codeFromBytes(Uint8Array.from([250, 251, 252]))).toBeNull();
  });

  it('has no look-alike characters', () => {
    for (const c of '01IOL') expect(PAIR_ALPHABET).not.toContain(c);
    expect(new Set(PAIR_ALPHABET).size).toBe(PAIR_ALPHABET.length);
  });

  it('reads a code however it was typed', () => {
    expect(normalizeCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeCode(' AB CD EF GH ')).toBe('ABCDEFGH');
    expect(normalizeCode('ABCDEFG')).toBeNull();
    expect(normalizeCode('ABCDEFGHJ')).toBeNull();
    expect(normalizeCode('ABCD!FGH')).toBeNull();
    expect(normalizeCode(12345678)).toBeNull();
    expect(normalizeCode('x'.repeat(100))).toBeNull();
  });

  it('refuses characters outside the alphabet, look-alikes included', () => {
    expect(normalizeCode('ABCDEFG0')).toBeNull();
    expect(normalizeCode('ABCDEFGI')).toBeNull();
    expect(normalizeCode('ABCDEFGO')).toBeNull();
    expect(PAIR_CODE_LENGTH).toBe(8);
  });
});

describe('devices', () => {
  it('names a device with 1 to 40 characters, spaces collapsed', () => {
    expect(deviceName("  Mamma's   phone ")).toBe("Mamma's phone");
    expect(deviceName('هاتف ماما')).toBe('هاتف ماما');
    expect(deviceName('   ')).toBeNull();
    expect(deviceName('x'.repeat(41))).toBeNull();
    expect(deviceName('x'.repeat(40))).toBe('x'.repeat(40));
    expect(deviceName(undefined)).toBeNull();
  });

  it('checks device ids and builds one sign-in per device', () => {
    expect(isDeviceId('abcdefghij0123456789')).toBe(true);
    expect(isDeviceId('../../private/google0')).toBe(false);
    expect(isDeviceId('short')).toBe(false);
    expect(deviceUid('g123', 'abcdefghij0123456789')).toBe('g123.phone.abcdefghij0123456789');
  });
});
