import { describe, expect, it } from 'vitest';
import { computeDay } from '../../src/prayer/core/prayer';
import { DEFAULT_SETTINGS } from '../../src/prayer/core/settings';
import { CHICAGO } from './prayer-fixtures';

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('computeDay', () => {
  // Aladhan gives the same times except Dhuhr 12:34 (adhan-js applies ISNA's
  // +1 min Dhuhr adjustment) and Asr 16:07 (rounding).
  it('matches Aladhan (ISNA, Hanafi) for Chicago on 2026-10-29', () => {
    const t = computeDay(new Date(2026, 9, 29), CHICAGO, DEFAULT_SETTINGS);
    expect({
      fajr: hm(t.fajr),
      sunrise: hm(t.sunrise),
      dhuhr: hm(t.dhuhr),
      asr: hm(t.asr),
      maghrib: hm(t.maghrib),
      isha: hm(t.isha),
    }).toMatchInlineSnapshot(`
      {
        "asr": "16:06",
        "dhuhr": "12:35",
        "fajr": "06:02",
        "isha": "19:06",
        "maghrib": "17:48",
        "sunrise": "07:19",
      }
    `);
  });
});
