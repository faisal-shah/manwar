import { settings } from '../data/store';

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
export const playChime = () => tone([880, 660, 880, 660], 0.6, 0.35, 'sine', 0.25);
