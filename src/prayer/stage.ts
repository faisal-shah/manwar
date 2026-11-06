import { effect, untracked } from '@preact/signals';
import { athanBlocked, face, prayerBusy, prayerSequence, shownFace, type Face } from '../app/face';
import { idleFor } from '../core/activity';
import { scheduledSleep, sleeping, wake } from '../core/display';
import { soundsHeld } from '../core/sound';
import { settings as wallSettings } from '../data/store';
import { pending } from '../features/messages/state';
import { timer, timerPhase } from '../features/timer/state';
import { athanSounding, unlockAudio } from './audio';
import { isPreviewing } from './core/clock';
import type { Takeover } from './core/schedule';
import { audioBlocked, clock, endPreview, picking, settings, settingsOpen, viewer } from './store';

/** Without a touch for this long, the wall goes back to its resting face (as the sleep rule waits, core/sleep.ts). */
export const FACE_IDLE_MS = 3 * 60_000;
const IDLE_CHECK_MS = 15_000;

/**
 * The face the wall rests on: the household's choice (Settings > Display),
 * except Family while a note waits or a timer runs, which a resting prayer
 * face would hide, and before the prayer clock has a place (its setup card
 * is no night screen).
 */
const restingFace = (): Face =>
  pending.value.length || timer.value || !settings.value.place ? 'family' : wallSettings.value.restingFace;

/** A phase that sounds: its athan's recording is on (the iqamah countdown never sounds). Only these wake a sleeping wall. */
function sounds(t: Takeover): boolean {
  if (t.phase === 'iqamah') return false;
  const s = settings.value;
  return t.kind === 'tahajjud' ? s.tahajjud.enabled : !!t.prayer && s.sounds[t.prayer].enabled;
}

/** What the family face has open outside #app (sheets, toasts portaled to the page) is inert under the prayer face too. */
function coverFamily(covered: boolean): void {
  for (const el of document.body.children) {
    if (el.classList.contains('prayer-face')) continue;
    if (covered && !el.hasAttribute('inert')) {
      el.setAttribute('inert', '');
      el.setAttribute('data-face-inert', '');
    } else if (!covered && el.hasAttribute('data-face-inert')) {
      el.removeAttribute('inert');
      el.removeAttribute('data-face-inert');
    }
  }
  // A field in a sheet keeps neither focus nor the on-screen keyboard behind the prayer face.
  const active = document.activeElement;
  if (covered && active instanceof HTMLElement && !active.closest('.prayer-face')) active.blur();
}

/** The prayer face's own screens (settings, a photo picker, the viewer, a preview) put away. Untracked: an effect calling it follows only its own signals. */
function putAway(): void {
  untracked(() => {
    if (isPreviewing()) endPreview();
    settingsOpen.value = false;
    picking.value = null;
    viewer.value = null;
  });
}

/**
 * The rules between the wall's two faces (app/face.ts). The athan sequence
 * shows over either and holds the wall's own sounds; a note or timer from a
 * phone brings the family face; idle and sleep return to the resting face.
 */
export function startStage(): void {
  // `?face=prayer` opens on the prayer face (tests, screenshots); otherwise the resting face.
  const asked = new URLSearchParams(location.search).get('face');
  face.value = asked === 'prayer' || asked === 'family' ? asked : restingFace();

  effect(() => {
    // A settings preview is the prayer face's own; only the real clock's sequence takes the wall, and
    // a sleeping wall only for a phase that sounds (an athan turned off does not light the room).
    const t = clock.value?.takeover;
    prayerSequence.value = !!t && !isPreviewing() && (sounds(t) || !scheduledSleep.value);
    prayerBusy.value = !!t || settingsOpen.value || !!viewer.value || isPreviewing();
  });
  // The wall's own sounds wait for the whole sequence (a note's chime with the note still under it).
  effect(() => {
    soundsHeld.value = athanSounding.value || prayerSequence.value;
  });
  effect(() => {
    athanBlocked.value = audioBlocked.value;
  });
  // A tap anywhere lets a blocked athan play (a click: on a touchscreen only the whole tap lets a page
  // start sound), and wakes the night clock (the family face's sleep screen is under it).
  document.addEventListener(
    'click',
    () => {
      if (audioBlocked.peek()) unlockAudio();
      if (sleeping.peek() && shownFace.peek() === 'prayer') wake();
    },
    { capture: true },
  );
  // The family face under the prayer face takes no taps, focus or reading.
  effect(() => {
    const shown = shownFace.value;
    document.documentElement.dataset.face = shown;
    document.getElementById('app')?.toggleAttribute('inert', shown === 'prayer');
    coverFamily(shown === 'prayer');
    if (shown === 'family') putAway();
  });

  // A note or timer for the wall shows on the family face (after the athan sequence, if one is on).
  let seen = new Set(pending.peek().map((m) => m.id));
  effect(() => {
    const ids = pending.value.map((m) => m.id);
    if (ids.some((id) => !seen.has(id))) face.value = 'family';
    seen = new Set(ids);
  });
  let run = timer.peek()?.run;
  effect(() => {
    const t = timer.value;
    if (t && t.run !== run) face.value = 'family';
    run = t?.run;
  });
  effect(() => {
    if (timerPhase.value === 'done') face.value = 'family';
  });

  // Asleep, the wall rests: the family face's sleep screen, or the prayer face's night clock.
  effect(() => {
    if (sleeping.value) face.value = restingFace();
  });
  setInterval(() => {
    if (idleFor() < FACE_IDLE_MS || prayerSequence.peek() || isPreviewing()) return;
    face.value = restingFace();
    putAway();
  }, IDLE_CHECK_MS);
}
