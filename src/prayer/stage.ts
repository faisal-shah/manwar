import { effect, untracked } from '@preact/signals';
import { athanBlocked, face, prayerBusy, prayerSequence, shownFace, type Face } from '../app/face';
import { idleFor } from '../core/activity';
import { scheduledSleep, sleeping, wake } from '../core/display';
import { soundsHeld } from '../core/sound';
import { settings as wallSettings } from '../data/store';
import { pending } from '../features/messages/state';
import { timer, timerPhase } from '../features/timer/state';
import { athanSounding, unlockAudio } from './audio';
import { previewing } from './core/clock';
import { FACE_IDLE_MS, inSequence, prayerBusyNow, restingFace } from './rules';
import { audioBlocked, clock, endPreview, picking, place, settings, settingsOpen, viewer } from './store';

const IDLE_CHECK_MS = 15_000;

const resting = (): Face =>
  restingFace({
    notes: pending.value.length,
    timer: !!timer.value,
    place: !!place.value,
    chosen: wallSettings.value.restingFace,
  });

/** The prayer face's own screens (settings, a photo picker, the viewer, a preview) put away. Untracked: an effect calling it follows only its own signals. */
function putAway(): void {
  untracked(() => {
    if (previewing.value) endPreview();
    settingsOpen.value = false;
    picking.value = null;
    viewer.value = null;
  });
}

/**
 * The rules between the wall's two faces (app/face.ts; the rules themselves
 * are pure in prayer/rules.ts). The athan sequence shows over either and
 * holds the wall's own sounds; a note or timer from a phone brings the
 * family face; idle and sleep return to the resting face.
 */
export function startStage(): void {
  // `?face=prayer` opens on the prayer face (tests, screenshots); otherwise the resting face.
  const asked = new URLSearchParams(location.search).get('face');
  face.value = asked === 'prayer' || asked === 'family' ? asked : resting();

  effect(() => {
    const st = clock.value;
    const open = { settings: settingsOpen.value, viewer: !!viewer.value, previewing: previewing.value };
    prayerSequence.value = inSequence(st?.takeover ?? null, settings.value, {
      previewing: open.previewing,
      asleep: scheduledSleep.value,
    });
    prayerBusy.value = prayerBusyNow(st, open);
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
  // Leaving the prayer face puts its own screens away (the family face under it is covered while it is mounted: ui/Face.tsx).
  effect(() => {
    if (shownFace.value === 'family') putAway();
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

  // Asleep, the wall rests (the family face's sleep screen, or the prayer face's night clock) with its screens put away.
  effect(() => {
    if (!sleeping.value) return;
    face.value = resting();
    putAway();
  });
  setInterval(() => {
    if (idleFor() < FACE_IDLE_MS || prayerSequence.peek() || previewing.peek()) return;
    face.value = resting();
    putAway();
  }, IDLE_CHECK_MS);
}
