import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeft, X } from 'lucide-preact';
import { checkPin, pinPausedUntil, pinRequest } from '../core/lock';
import { nowMs } from '../lib/clock';
import { IconButton } from './controls';

const portal = (node: ComponentChildren) => createPortal(node, document.body);

/*
 * The second tap of a double tap lands where the first one did, a moment
 * later. When the first opened an overlay, the second falls on its scrim
 * and would close it again at once; so a scrim ignores a tap that comes
 * soon after it opened and close to the tap that opened it.
 */
export const DOUBLE_TAP_MS = 450;
const DOUBLE_TAP_REM = 6;
let lastDown = { x: -1e9, y: -1e9 };
if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', (e) => (lastDown = { x: e.clientX, y: e.clientY }), { capture: true, passive: true });

/** Close handler for a scrim (tap outside) that lets the rest of a double tap through. */
export function useScrimClose(onClose: () => void): (e: MouseEvent) => void {
  const opened = useRef({ at: performance.now(), ...lastDown });
  return (e) => {
    const o = opened.current;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
    const near = Math.hypot(e.clientX - o.x, e.clientY - o.y) < DOUBLE_TAP_REM * rem;
    if (near && performance.now() - o.at < DOUBLE_TAP_MS) return;
    onClose();
  };
}

/** Right-hand side sheet (editors, settings pages). */
export function Sheet({
  title,
  onClose,
  onBack,
  footer,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  footer?: ComponentChildren;
  wide?: boolean;
  children: ComponentChildren;
}) {
  const scrimClose = useScrimClose(onClose);
  return portal(
    <>
      <div class="scrim" onClick={scrimClose} />
      <section class={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-label={title}>
        <header class="sheet-head">
          {onBack ? (
            <IconButton label="Back" onClick={onBack}>
              <ArrowLeft size={28} />
            </IconButton>
          ) : null}
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={28} />
          </IconButton>
        </header>
        <div class="sheet-body scroll">{children}</div>
        {footer && <footer class="sheet-foot">{footer}</footer>}
      </section>
    </>,
  );
}

/** Centered dialog (confirmations, celebrations, pickers). */
export function Modal({
  title,
  onClose,
  children,
  actions,
}: {
  title?: string;
  onClose: () => void;
  children: ComponentChildren;
  actions?: ComponentChildren;
}) {
  const scrimClose = useScrimClose(onClose);
  return portal(
    <>
      <div class="scrim top" onClick={scrimClose} />
      <div class="modal" role="dialog" aria-label={title}>
        {title && <h2>{title}</h2>}
        <div class="scroll" style={{ minHeight: 0 }}>
          {children}
        </div>
        {actions && <div class="modal-actions">{actions}</div>}
      </div>
    </>,
  );
}

/**
 * Floating card anchored beside an element's rect (event details, task
 * details, menus). Opens to whichever side has room; tap outside closes.
 */
export function Popover({
  anchor,
  onClose,
  width = 44,
  children,
}: {
  anchor: DOMRect;
  onClose: () => void;
  width?: number;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrimClose = useScrimClose(onClose);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Place it again when the viewport changes (an on-screen keyboard that resizes the page), so it stays on screen.
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    const onResize = () => setViewport((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const w = width * rem;
      const h = el.offsetHeight;
      const gap = 1.2 * rem;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = anchor.right + gap;
      if (left + w > vw - gap) left = anchor.left - gap - w;
      if (left < gap) left = Math.max(gap, Math.min(vw - w - gap, anchor.left + anchor.width / 2 - w / 2));
      const top = Math.max(gap, Math.min(vh - h - gap, anchor.top + anchor.height / 2 - h / 2));
      setPos({ left, top });
    };
    place();
    // Content that grows after opening (a picker, a late-loading line) must not push the card off screen.
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor, width, viewport]);
  return portal(
    <>
      <div class="popover-scrim" onClick={scrimClose} />
      <div
        ref={ref}
        class="popover"
        role="dialog"
        style={{ width: `${width}rem`, left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      >
        {children}
      </div>
    </>,
  );
}

/* ---------- Toasts ---------- */

interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
const toasts = signal<ToastItem[]>([]);
let toastSeq = 0;

/** Bottom-left snackbar with an optional single action (e.g. Undo). */
export function toast(text: string, action?: ToastItem['action'], ms = 5000): void {
  const id = ++toastSeq;
  toasts.value = [...toasts.value.slice(-2), { id, text, action }];
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), ms);
}

export function ToastHost() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((t) => (
        <div class="toast" key={t.id}>
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                toasts.value = toasts.value.filter((x) => x.id !== t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Confirm ---------- */

const confirmReq = signal<{ title: string; body?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void } | null>(
  null,
);

export function confirm(title: string, opts: { body?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq.value = { title, body: opts.body, ok: opts.ok ?? 'OK', danger: opts.danger, resolve };
  });
}

/** Choose one option (e.g. This event / Following / All). Resolves null on cancel. */
const chooseReq = signal<{
  title: string;
  options: { value: string; label: string }[];
  resolve: (v: string | null) => void;
} | null>(null);

export function choose<T extends string>(title: string, options: { value: T; label: string }[]): Promise<T | null> {
  return new Promise((resolve) => {
    chooseReq.value = { title, options, resolve: resolve as (v: string | null) => void };
  });
}

export function DialogHost() {
  const c = confirmReq.value;
  const ch = chooseReq.value;
  const done = (v: boolean) => {
    c?.resolve(v);
    confirmReq.value = null;
  };
  const pick = (v: string | null) => {
    ch?.resolve(v);
    chooseReq.value = null;
  };
  return (
    <>
      {c && (
        <Modal
          title={c.title}
          onClose={() => done(false)}
          actions={
            <>
              <button type="button" class="btn" onClick={() => done(false)}>
                Cancel
              </button>
              <button type="button" class={`btn ${c.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => done(true)}>
                {c.ok}
              </button>
            </>
          }
        >
          {c.body && <p class="muted">{c.body}</p>}
        </Modal>
      )}
      {ch && (
        <Modal title={ch.title} onClose={() => pick(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '36rem' }}>
            {ch.options.map((o) => (
              <button type="button" class="btn" onClick={() => pick(o.value)}>
                {o.label}
              </button>
            ))}
            <button type="button" class="btn btn-ghost" onClick={() => pick(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
      <PinPadHost />
    </>
  );
}

/* ---------- Parent PIN pad ---------- */

function PinPadHost() {
  const req = pinRequest.value;
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setPin('');
    setBad(false);
  }, [req]);
  if (!req) return null;
  const pausedFor = Math.ceil((pinPausedUntil.value - nowMs.value) / 1000);
  const paused = pausedFor > 0;
  const press = async (d: string) => {
    if (paused) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setBad(false);
    if (next.length === 4) {
      if (await checkPin(next)) req.resolve(true);
      else {
        // Clear at once (the shake shows the miss) so digits typed next start a fresh entry.
        setBad(true);
        setPin('');
      }
    }
  };
  return (
    <Modal title="Parent PIN" onClose={() => req.resolve(false)}>
      <p class={paused ? 'pin-paused' : 'muted'} style={{ textAlign: 'center', margin: 0 }} aria-live="polite">
        {paused ? `Too many wrong PINs. Try again in ${pausedFor} s.` : (req.reason ?? 'Enter the PIN to make changes.')}
      </p>
      <div class={`pin-dots${bad ? ' shake' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <span class={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div class="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button type="button" disabled={paused} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" style={{ fontSize: '1.6rem' }} onClick={() => req.resolve(false)}>
          Cancel
        </button>
        <button type="button" disabled={paused} onClick={() => press('0')}>
          0
        </button>
        <button type="button" style={{ fontSize: '1.6rem' }} onClick={() => setPin(pin.slice(0, -1))}>
          Delete
        </button>
      </div>
    </Modal>
  );
}
