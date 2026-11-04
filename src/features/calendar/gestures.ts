import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

/**
 * Horizontal swipe to page (left = later, right = earlier). The element
 * should have `touch-action: pan-y` so vertical scrolling stays native. The
 * click that ends a swipe is swallowed so it does not open an event.
 */
export function useSwipe(ref: RefObject<HTMLElement | null>, onPage: (dir: -1 | 1) => void): void {
  const cb = useRef(onPage);
  cb.current = onPage;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number; id: number } | null = null;
    let swallowUntil = 0;
    /** Pointers currently down; a second finger makes it a pinch, never a swipe. */
    const active = new Set<number>();
    const down = (e: PointerEvent) => {
      active.add(e.pointerId);
      if (active.size > 1) start = null;
      else if (e.isPrimary && e.button === 0) start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const up = (e: PointerEvent) => {
      active.delete(e.pointerId);
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 8 * remPx() && Math.abs(dx) > 2 * Math.abs(dy)) {
        swallowUntil = performance.now() + 350;
        cb.current(dx < 0 ? 1 : -1);
      }
    };
    const cancel = (e: PointerEvent) => {
      active.delete(e.pointerId);
      start = null;
    };
    const click = (e: MouseEvent) => {
      if (performance.now() < swallowUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    el.addEventListener('click', click, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      el.removeEventListener('click', click, true);
    };
  }, [ref]);
}

/**
 * Two-finger pinch (or Ctrl + wheel) on a vertical scroller scales a size in
 * rem, keeping the point under the fingers in place.
 */
export function usePinchZoom(
  ref: RefObject<HTMLElement | null>,
  get: () => number,
  set: (v: number) => void,
  min: number,
  max: number,
): void {
  const io = useRef({ get, set });
  io.current = { get, set };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    const zoomAt = (clientY: number, next: number, base: number, baseScroll: number) => {
      const y = clientY - el.getBoundingClientRect().top;
      io.current.set(next);
      el.scrollTop = ((baseScroll + y) * next) / base - y;
    };
    let pinch: { d0: number; h0: number; s0: number } | null = null;
    // Finger distance in any direction: people pinch side to side as often as up and down.
    const span = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => (t[0].clientY + t[1].clientY) / 2;
    const tstart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { d0: Math.max(span(e.touches), 1), h0: io.current.get(), s0: el.scrollTop };
    };
    const tmove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      zoomAt(mid(e.touches), clamp((pinch.h0 * span(e.touches)) / pinch.d0), pinch.h0, pinch.s0);
    };
    const tend = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const h = io.current.get();
      zoomAt(e.clientY, clamp(h * (1 - e.deltaY * 0.002)), h, el.scrollTop);
    };
    // Listen on the whole view (headers and all-day row too); scroll and scale the scroller.
    const area = el.closest<HTMLElement>('.sched') ?? el;
    area.addEventListener('touchstart', tstart, { passive: true });
    area.addEventListener('touchmove', tmove, { passive: false });
    area.addEventListener('touchend', tend);
    area.addEventListener('touchcancel', tend);
    area.addEventListener('wheel', wheel, { passive: false });
    return () => {
      area.removeEventListener('touchstart', tstart);
      area.removeEventListener('touchmove', tmove);
      area.removeEventListener('touchend', tend);
      area.removeEventListener('touchcancel', tend);
      area.removeEventListener('wheel', wheel);
    };
  }, [ref, min, max]);
}

export { remPx };
