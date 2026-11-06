import { computed, signal } from '@preact/signals';
import type { FunctionComponent } from 'preact';

/**
 * The wall's two faces: Family (Manwar's tabs) and Prayer (the prayer
 * clock, `src/prayer/`). This module is all the shell needs of them; the
 * rules that move between them (prayer/stage.ts) and the prayer face itself
 * load on the wall only (app/start.ts), never on a phone.
 */
export type Face = 'family' | 'prayer';

/** The face chosen: the switch buttons, and the rules (a note or timer brings Family; idle, the resting face). */
export const face = signal<Face>('family');

/** True while the prayer clock's athan sequence is on: it shows over whichever face was chosen. */
export const prayerSequence = signal(false);

/** True while the prayer face has something a reload would interrupt (its settings, a preview, the sequence). */
export const prayerBusy = signal(false);

/** What is on screen. */
export const shownFace = computed<Face>(() => (prayerSequence.value ? 'prayer' : face.value));

/** The prayer face's layer once its module has loaded on the wall; null before, and on a phone. */
export const prayerLayer = signal<FunctionComponent | null>(null);

/** The athan could not start without a tap (the browser's autoplay rule): the family face says so too. */
export const athanBlocked = signal(false);
