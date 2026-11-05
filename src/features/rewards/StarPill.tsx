import { Star } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatStars } from './logic';
import { openHistory } from './history-state';
import { plural } from '../../lib/text';

/** Counts toward a new value; increases wait for the flying stars to land. A new `id` jumps straight to its value. */
function useCountUp(id: string, value: number, delay = 520, ms = 520): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const lastId = useRef(id);
  useEffect(() => {
    if (lastId.current !== id) {
      lastId.current = id;
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    if (start === value) return;
    let raf = 0;
    let t0 = 0;
    const step = (t: number) => {
      t0 ||= t;
      const k = Math.min(1, (t - t0) / ms);
      const v = Math.round(start + (value - start) * k);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => (raf = requestAnimationFrame(step)), value > start ? delay : 0);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [id, value]);
  return lastId.current === id ? shown : value;
}

/** Gold star and balance; tapping it opens that profile's star history. Flying stars aim at `data-stars-for`. */
export function StarPill({ profileId, value, large }: { profileId: string; value: number; large?: boolean }) {
  const shown = useCountUp(profileId, value);
  return (
    <button
      type="button"
      class={`pill star-pill${large ? ' large' : ''}`}
      data-stars-for={profileId}
      aria-label={`${plural(value, 'star')}, show history`}
      onClick={(e) => {
        e.stopPropagation();
        openHistory(profileId);
      }}
    >
      <Star class="star-icon" size={large ? '2.2rem' : '1.6rem'} strokeWidth={2} />
      <span>{formatStars(shown)}</span>
    </button>
  );
}
