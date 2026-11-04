import { signal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import { playCelebrate } from '../../core/sound';

/**
 * Completion feedback: stars flying into a balance pill, a confetti burst,
 * and the full-screen "all done" emoji rain. Only transforms and opacity
 * animate, so a mid-range tablet keeps up.
 */

const remPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;

let layer: HTMLDivElement | null = null;
function fxLayer(): HTMLDivElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

function spawn(cls: string, x: number, y: number, vars: Record<string, string>, text = ''): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.addEventListener('animationend', () => el.remove(), { once: true });
  fxLayer().appendChild(el);
  return el;
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** The balance pill for a profile (column header, Home card, Rewards). */
export const starTarget = (profileId: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-stars-for="${CSS.escape(profileId)}"]`)].find(
    (el) => el.offsetParent !== null,
  );

/** Stars fly from `from` into the profile's balance pill, which bumps as they land. */
export function flyStars(from: DOMRect, profileId: string, stars: number): void {
  const target = starTarget(profileId);
  if (!target) return;
  const a = center(from);
  const b = center(target.getBoundingClientRect());
  const rem = remPx();
  const n = Math.min(6, Math.max(3, stars));
  for (let i = 0; i < n; i++) {
    const jitter = (Math.random() - 0.5) * 3;
    spawn(
      'fx-star',
      a.x,
      a.y,
      {
        '--dx': `${(b.x - a.x) / rem}rem`,
        '--dy': `${(b.y - a.y) / rem}rem`,
        '--mx': `${jitter}rem`,
        'animation-delay': `${i * 70}ms`,
      },
      '★',
    );
  }
  setTimeout(
    () => {
      target.classList.remove('bump');
      void target.offsetWidth;
      target.classList.add('bump');
    },
    620 + n * 70,
  );
}

const CONFETTI = ['var(--c)', 'var(--star)', 'var(--accent)', 'var(--today)', 'color-mix(in srgb, var(--c) 50%, white)'];

/** A ring of confetti bursting out of a rect (a section button). */
export function confettiAt(rect: DOMRect, color: string): void {
  const { x, y } = center(rect);
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 5 + Math.random() * 9;
    const el = spawn('fx-confetti', x, y, {
      '--x': `${Math.cos(angle) * dist}rem`,
      '--y': `${Math.sin(angle) * dist - 2}rem`,
      '--r': `${Math.round(Math.random() * 540 - 270)}deg`,
      '--bg': CONFETTI[i % CONFETTI.length],
      'animation-delay': `${Math.random() * 60}ms`,
    });
    el.style.setProperty('--c', color);
  }
}

/* ---------- All done for the day ---------- */

const RAIN = ['😎', '🥳', '🎉', '🌟', '🤩', '🦄', '🌈', '🏆', '🙌'];

export const celebration = signal<{ name: string; emoji: string; color: string; key: number } | null>(null);

export function celebrate(name: string, color: string, emoji?: string): void {
  playCelebrate();
  celebration.value = { name, color, emoji: emoji || RAIN[Math.floor(Math.random() * RAIN.length)], key: Date.now() };
}

/** Full-screen emoji rain with the profile's name; tap or wait about 3 s to dismiss. */
export function CelebrationHost() {
  const c = celebration.value;
  const drops = useMemo(
    () =>
      // Negative delays start part of the rain mid-fall, so the screen fills at once.
      Array.from({ length: 44 }, (_, i) => ({
        left: Math.random() * 100,
        size: 3 + Math.random() * 6,
        dur: 1.8 + Math.random() * 1.2,
        delay: i % 2 ? -Math.random() * 1.2 : Math.random() * 0.9,
      })),
    [c?.key],
  );
  useEffect(() => {
    if (!c) return;
    const t = setTimeout(() => (celebration.value = null), 3400);
    return () => clearTimeout(t);
  }, [c?.key]);
  if (!c) return null;
  return (
    <div class="fx-celebrate" role="alert" onClick={() => (celebration.value = null)} style={{ '--c': c.color }}>
      {drops.map((d) => (
        <span
          class="fx-drop"
          aria-hidden="true"
          style={{ left: `${d.left}%`, fontSize: `${d.size}rem`, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}
        >
          {c.emoji}
        </span>
      ))}
      <div class="fx-message">
        <span class="fx-yay serif">Yay, {c.name}!</span>
        <span class="fx-sub serif">You completed all your tasks for the day.</span>
      </div>
    </div>
  );
}
