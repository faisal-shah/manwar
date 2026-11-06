import { describe, expect, it } from 'vitest';
import type { BundledAudio } from '../../src/prayer/core/media';
import { listedRecordings, shortLabel, soundOptions } from '../../src/prayer/recordings';

/** The athans a setting can choose (prayer/recordings.ts): the bundled ones and those a tablet uploaded. */

describe('the uploads listed in the prayer settings document', () => {
  it('reads well-formed entries', () => {
    expect(listedRecordings({ recordings: { a1: { name: 'Grandpa', durationSec: 182.5 } } })).toEqual([
      { id: 'a1', name: 'Grandpa', durationSec: 182.5 },
    ]);
  });

  it('leaves out anything malformed (the document is outside input)', () => {
    expect(listedRecordings({})).toEqual([]);
    expect(listedRecordings({ recordings: null })).toEqual([]);
    expect(listedRecordings({ recordings: [{ name: 'x', durationSec: 1 }] })).toEqual([]);
    expect(
      listedRecordings({
        recordings: {
          a: { name: '', durationSec: 10 },
          b: { name: 'No length' },
          c: { name: 'Infinite', durationSec: Infinity },
          d: 'Grandpa',
          e: null,
          f: { name: 'Fine', durationSec: 0 },
        },
      }),
    ).toEqual([{ id: 'f', name: 'Fine', durationSec: 0 }]);
  });
});

describe('the recordings to choose from', () => {
  const bundled: BundledAudio[] = [
    { id: 'athan-1', kind: 'athan', label: 'Athan — Mishary Rashid Alafasy (Makkah)', file: 'a1.mp3', durationSec: 187 },
    { id: 'fajr-1', kind: 'fajr', label: 'Fajr athan — Mishary Rashid Alafasy (maqam Hijaz)', file: 'f1.mp3', durationSec: 220 },
    { id: 'chime', kind: 'chime', label: 'Chime', file: 'chime.mp3', durationSec: 2 },
  ] as BundledAudio[];

  it('names the reciter, and Fajr athans as Fajr', () => {
    expect(shortLabel('Fajr athan — Mishary Rashid Alafasy (maqam Hijaz)')).toBe('Fajr · Mishary Rashid Alafasy');
    expect(shortLabel('Athan — Mishary Rashid Alafasy (Makkah)')).toBe('Mishary Rashid Alafasy');
  });

  it('lists the athans then the uploads, Fajr athans first for Fajr, never the chime', () => {
    const uploads = [{ id: 'u1', name: 'Grandpa', durationSec: 100 }];
    const label = (n: string) => `Uploaded: ${n}`;
    expect(soundOptions(bundled, uploads, 'athan', label).map(([id]) => id)).toEqual(['athan-1', 'fajr-1', 'upload:u1']);
    expect(soundOptions(bundled, uploads, 'fajr', label)).toEqual([
      ['fajr-1', 'Fajr · Mishary Rashid Alafasy'],
      ['athan-1', 'Mishary Rashid Alafasy'],
      ['upload:u1', 'Uploaded: Grandpa'],
    ]);
  });
});
