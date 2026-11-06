import { afterEach, describe, expect, it, vi } from 'vitest';

/** The prayer clock runs on the app's clock (lib/clock.ts), `?now=` included; `?speed=` and previews move only it. */

async function clocks(search: string) {
  vi.resetModules();
  vi.stubGlobal('location', { search });
  const app = await import('../../src/lib/clock');
  const prayer = await import('../../src/prayer/core/clock');
  return { app, prayer };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the prayer clock', () => {
  it("reads the app's pinned time, however late its module loads", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-06T08:00:00Z'));
    vi.resetModules();
    vi.stubGlobal('location', { search: '?now=2026-10-29T12:34:30' });
    const app = await import('../../src/lib/clock');
    vi.advanceTimersByTime(90_000);
    const prayer = await import('../../src/prayer/core/clock');
    expect(prayer.now().getTime()).toBe(app.currentTime());
    expect(prayer.now().getTime()).toBe(new Date('2026-10-29T12:36:00').getTime());
  });

  it('runs faster with ?speed=, and a preview moves it until it returns to the real time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { app, prayer } = await clocks('?speed=60');
    const start = prayer.now().getTime();
    vi.advanceTimersByTime(1000);
    expect(prayer.now().getTime() - start).toBe(60_000);
    expect(prayer.previewing.value).toBe(false);
    expect(prayer.previewRun()).toBe(0);
    prayer.travelTo(new Date('2027-03-20T05:00:00'));
    expect(prayer.previewing.value).toBe(true);
    expect(prayer.previewRun()).toBe(1);
    expect(prayer.now().getTime()).toBe(new Date('2027-03-20T05:00:00').getTime());
    prayer.travelTo(null);
    expect(prayer.previewing.value).toBe(false);
    expect(prayer.speed.value).toBe(1);
    expect(prayer.now().getTime()).toBe(app.currentTime());
  });
});
