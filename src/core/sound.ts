import { effect, signal } from '@preact/signals';
import { settings } from '../data/store';

/**
 * True while an athan sounds on the wall (prayer/stage.ts): the wall's own
 * sounds wait until it ends. Each kind waits once (the last of a timer's
 * repeated chimes, a note's chime and its reading), then they play in the
 * order each last came, a moment apart.
 */
export const soundsHeld = signal(false);
const waiting = new Map<string, () => void>();
const AFTER_HOLD_GAP_MS = 1500;

/** Play `sound` now, or once the athan ends (`kind`: the last of each kind waiting plays). */
export function whenFree(kind: string, sound: () => void): void {
  if (!soundsHeld.peek()) return sound();
  waiting.delete(kind);
  waiting.set(kind, sound);
}

effect(() => {
  if (soundsHeld.value || !waiting.size) return;
  const due = [...waiting.values()];
  waiting.clear();
  due.forEach((play, i) => setTimeout(play, i * AFTER_HOLD_GAP_MS));
});

/** Small synthesized sounds (no audio files): a pop for a check-off, a chime for timers and messages. */
let ctx: AudioContext | null = null;

function tone(freqs: number[], dur: number, gap = 0.09, type: OscillatorType = 'sine', gain = 0.18) {
  if (!settings.value.sounds) return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = type;
      o.frequency.value = f;
      const s = t0 + i * gap;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(gain, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      o.connect(g).connect(ctx!.destination);
      o.start(s);
      o.stop(s + dur + 0.05);
    });
  } catch {
    /* audio unavailable (autoplay policy): stay silent */
  }
}

export const playCheck = () => tone([660, 990], 0.18, 0.07, 'triangle');
export const playCelebrate = () => tone([523, 659, 784, 1047], 0.35, 0.1, 'triangle');
export const playChime = () => whenFree('chime', () => tone([880, 660, 880, 660], 0.6, 0.35, 'sine', 0.25));
