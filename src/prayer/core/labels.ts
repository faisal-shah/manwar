import type { Settings } from './settings';

/**
 * The words of the prayer settings that the wall's settings panel and the
 * phone's More > Prayer times both show, so the two say the same (the
 * ranges are RANGES in settings.ts; the choices of a select are
 * CALC_METHODS and HIGH_LAT_RULES there).
 */
export const LABELS = {
  method: { label: 'Calculation method' },
  madhab: {
    label: 'Asr',
    hint: "Hanafi: shadow twice an object's length. Standard: Shafi'i, Maliki, Hanbali.",
    options: [
      ['hanafi', 'Hanafi'],
      ['shafi', 'Standard'],
    ] as const satisfies Options<Settings['madhab']>,
  },
  highLatRule: { label: 'High-latitude rule', hint: 'How Fajr and Isha are found when twilight never fully ends.' },
  adjust: { label: 'Adjust calculated athan times', unit: 'min' },
  iqamah: { label: 'Iqamah, minutes after athan', unit: 'min' },
  jumuah: { label: "Show Jumu'ah", hint: "On Fridays Dhuhr becomes Jumu'ah and its iqamah is the first Jumu'ah time." },
  addJumuah: { label: "Add a second Jumu'ah" },
  atEachPrayer: { label: 'At each prayer' },
  preCountdown: { label: 'One-minute countdown before the athan' },
  chime: { label: 'Chime before the athan' },
  dua: { label: 'Dua after the athan' },
  iqamahCountdown: { label: 'Full-screen iqamah countdown', hint: 'The last minute before iqamah.' },
  tahajjud: { label: 'Tahajjud', hint: 'An athan at the start of the last third of the night.' },
  ramadan: {
    label: 'Ramadan',
    hint: 'Suhoor and iftar countdowns and the iftar dua.',
    options: [
      ['auto', 'Auto'],
      ['on', 'On'],
      ['off', 'Off'],
    ] as const satisfies Options<Settings['ramadan']>,
  },
  hijriOffset: { label: 'Hijri date adjustment', hint: 'Whole days, to match the local moonsighting.', unit: 'days' },
};

type Options<T extends string> = readonly (readonly [T, string])[];

/** "Jumu'ah", or "Jumu'ah 2" of two. */
export const jumuahLabel = (i: number, count: number) => (count > 1 ? `Jumu'ah ${i + 1}` : "Jumu'ah");
