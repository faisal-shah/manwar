import { afterEach, describe, expect, it, vi } from 'vitest';

/** The wall's sounds wait for an athan (core/sound.ts whenFree). */

vi.mock('../../src/data/store', async () => {
  const { signal } = await import('@preact/signals');
  return { settings: signal({ sounds: true }) };
});

const { playCheck, soundsHeld, whenFree } = await import('../../src/core/sound');

afterEach(() => {
  soundsHeld.value = false;
  vi.useRealTimers();
});

describe('sounds held for the athan', () => {
  it('plays a sound at once while nothing holds them', () => {
    const played: string[] = [];
    whenFree('chime', () => played.push('chime'));
    expect(played).toEqual(['chime']);
  });

  it('keeps the last of each kind while held, and plays them in order, a moment apart, once released', () => {
    vi.useFakeTimers();
    const played: string[] = [];
    soundsHeld.value = true;
    whenFree('chime', () => played.push('chime 1'));
    whenFree('speak', () => played.push('speak'));
    whenFree('chime', () => played.push('chime 2'));
    vi.advanceTimersByTime(10_000);
    expect(played).toEqual([]);
    soundsHeld.value = false;
    vi.advanceTimersByTime(0);
    expect(played).toEqual(['speak']);
    vi.advanceTimersByTime(1500);
    expect(played).toEqual(['speak', 'chime 2']);
    // Released, nothing is waiting any more.
    soundsHeld.value = true;
    soundsHeld.value = false;
    vi.advanceTimersByTime(5000);
    expect(played).toEqual(['speak', 'chime 2']);
  });
});

describe('synthesized sounds', () => {
  it('resume an audio context the browser suspended', () => {
    const resumed: string[] = [];
    const node = () => ({
      connect: (n: unknown) => n ?? node(),
      start() {},
      stop() {},
      frequency: {},
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
    });
    class Context {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      resume() {
        resumed.push(this.state);
        this.state = 'running';
        return Promise.resolve();
      }
      createOscillator = node;
      createGain = node;
    }
    vi.stubGlobal('AudioContext', Context);
    playCheck();
    playCheck();
    expect(resumed).toEqual(['suspended']);
    vi.unstubAllGlobals();
  });
});
