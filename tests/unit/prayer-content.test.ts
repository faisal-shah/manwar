import { describe, expect, it } from 'vitest';
import { DAILY, dailyItem, greetingFor, kidReminder } from '../../src/prayer/core/content';
import type { Slot } from '../../src/prayer/core/schedule';

/** The prayer face's words of the day (prayer/core/content.ts). */

const at = (day: number, h: number, m = 0, s = 0) => new Date(2026, 9, day, h, m, s);

describe('the verse, hadith and dua of the day', () => {
  it('stays for its minutes, then moves to the next', () => {
    const a = dailyItem(at(29, 10, 0));
    expect(dailyItem(at(29, 10, 3, 59))).toBe(a);
    const b = dailyItem(at(29, 10, 4));
    expect(b).not.toBe(a);
    expect(DAILY.indexOf(b!)).toBe((DAILY.indexOf(a!) + 1) % DAILY.length);
    expect(dailyItem(at(29, 10, 8), 8)).toBe(dailyItem(at(29, 10, 15), 8));
  });

  it('starts each day at another item', () => {
    expect(dailyItem(at(30, 10))).not.toBe(dailyItem(at(29, 10)));
  });

  it('keeps to a kind, and to short texts for tight layouts', () => {
    expect(dailyItem(at(29, 10), 4, 'dua')?.type).toBe('dua');
    const short = Math.min(...DAILY.map((d) => d.english.length));
    for (let m = 0; m < 60; m += 4) expect(dailyItem(at(29, 10, m), 4, undefined, 120)!.english.length).toBeLessThanOrEqual(120);
    expect(dailyItem(at(29, 10), 4, undefined, short - 1)).toBeNull();
  });
});

describe('the greeting', () => {
  const thursday = at(29, 12);
  const friday = at(30, 12);
  it('is Eid on 1 to 3 Shawwal and 10 to 13 Dhu al-Hijjah, before Ramadan and Friday', () => {
    expect(greetingFor(friday, { day: 1, month: 10 }, true)?.id).toBe('eid');
    expect(greetingFor(thursday, { day: 3, month: 10 }, false)?.id).toBe('eid');
    expect(greetingFor(thursday, { day: 4, month: 10 }, false)).toBeNull();
    expect(greetingFor(thursday, { day: 10, month: 12 }, false)?.id).toBe('eid');
    expect(greetingFor(thursday, { day: 13, month: 12 }, false)?.id).toBe('eid');
    expect(greetingFor(thursday, { day: 9, month: 12 }, false)).toBeNull();
  });
  it('is Ramadan Kareem in Ramadan, then Jumu’ah Mubarak on a Friday', () => {
    expect(greetingFor(friday, { day: 5, month: 9 }, true)?.id).toBe('ramadan');
    expect(greetingFor(friday, { day: 5, month: 4 }, false)?.id).toBe('jumuah-mubarak');
    expect(greetingFor(thursday, { day: 5, month: 4 }, false)).toBeNull();
  });
});

describe("the kids' reminder", () => {
  const slot = (prayer: Slot['prayer'], h: number, m: number): Slot => ({
    id: `2026-10-29:${prayer}`,
    prayer,
    name: prayer,
    athan: at(29, h, m),
    iqamah: at(29, h, m + 15),
  });
  const dhuhr = slot('dhuhr', 12, 35);
  const asr = slot('asr', 16, 6);

  it('calls to the prayer just after its athan, and to wudu before the next', () => {
    expect(kidReminder(at(29, 12, 40), asr, dhuhr)).toBe("It's Dhuhr time! Let's go pray together.");
    expect(kidReminder(at(29, 15, 56), asr, dhuhr)).toBe('Asr is in 10 minutes. Time to make wudu!');
  });

  it('rotates through the reminders in between, with the next prayer among them', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 20 * 45; s += 45) seen.add(kidReminder(new Date(at(29, 14).getTime() + s * 1000), asr, dhuhr));
    expect(seen.has('Next up: Asr. Get ready!')).toBe(true);
    expect(seen.size).toBeGreaterThan(10);
  });
});
