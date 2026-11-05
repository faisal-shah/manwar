import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeft, X } from 'lucide-preact';
import { checkPin, pinPausedUntil, pinRequest } from '../core/lock';
import { pauseSecondsLeft } from '../core/pin';
import { currentTime, nowMs } from '../lib/clock';
import { isPhone } from '../app/layout';
import { useBack } from './back';
import { IconButton } from './controls';

const portal = (node: ComponentChildren) => createPortal(node, document.body);

/*
 * The second tap of a double tap lands where the first one did, a moment
 * later. When the first opened an overlay, the second falls on its scrim
 * and would close it again at once; so a scrim ignores a tap that comes
 * soon after the overlay opened and close to the tap that opened it. An
 * overlay can also open under that tap (a centered dialog, and on the
 * phone every sheet: the editor's X sits where the header's + was), so the
 * second tap can land on a control in it (a PIN key, Close): an overlay
 * ignores it inside too.
 */
export const DOUBLE_TAP_MS = 450;
const DOUBLE_TAP_REM = 6;
let lastDown = { x: -1e9, y: -1e9 };
if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', (e) => (lastDown = { x: e.clientX, y: e.clientY }), { capture: true, passive: true });

/** When and where a tap went down: the latest one, now. */
export interface TapMark {
  at: number;
  x: number;
  y: number;
}
export const tapMark = (): TapMark => ({ at: performance.now(), ...lastDown });

/** Whether a tap at (x, y) now (by default the latest one) is the second tap of the double tap begun at `m`. */
export function secondTapOf(m: TapMark, x = lastDown.x, y = lastDown.y): boolean {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
  return performance.now() - m.at < DOUBLE_TAP_MS && Math.hypot(x - m.x, y - m.y) < DOUBLE_TAP_REM * rem;
}

/** Whether a tap is the rest of the double tap that opened the calling overlay. */
function useOpeningTap(): (e: MouseEvent) => boolean {
  const opened = useRef(tapMark());
  return (e) => secondTapOf(opened.current, e.clientX, e.clientY);
}

/**
 * For a view that opens in place of what was tapped (a phone tab's inner
 * view): put it on the view's root as onClickCapture, and the rest of the
 * double tap that opened it presses nothing in it.
 */
export function useOpeningTapGuard(): (e: MouseEvent) => void {
  const openingTap = useOpeningTap();
  return (e) => {
    if (!openingTap(e)) return;
    e.stopPropagation();
    e.preventDefault();
  };
}

/** The onClose of every overlay on screen, for closeOverlays(). */
const onScreen = new Set<{ current: () => void }>();

/**
 * Every overlay (sheet, dialog, popover, menu) calls this. `scrim` closes it
 * on a tap outside, letting the rest of the opening double tap through;
 * `content`, for its box (onClickCapture), drops that tap inside it. The
 * overlay also closes on idle return (closeOverlays).
 */
export function useOverlay(onClose: () => void): { scrim: (e: MouseEvent) => void; content: (e: MouseEvent) => void } {
  const openingTap = useOpeningTap();
  const close = useRef(onClose);
  close.current = onClose;
  // On the phone, Back closes it.
  useBack(onClose, isPhone);
  useEffect(() => {
    onScreen.add(close);
    return () => void onScreen.delete(close);
  }, []);
  return {
    scrim: (e) => {
      if (!openingTap(e)) onClose();
    },
    content: (e) => {
      if (!openingTap(e)) return;
      e.stopPropagation();
      e.preventDefault();
    },
  };
}

/** Close every overlay on screen, as if tapped away (idle return): a PIN request among them is refused. */
export function closeOverlays(): void {
  for (const c of [...onScreen]) c.current();
}

/** Tap handler for a full-screen layer that is not an overlay to close (the sleep screen), with the same double-tap rule. */
export function useScrimClose(onClose: () => void): (e: MouseEvent) => void {
  const openingTap = useOpeningTap();
  return (e) => {
    if (!openingTap(e)) onClose();
  };
}

/**
 * Close an editor or popover once what it shows is gone from the store
 * (deleted on another device), so a save cannot bring it back or fail;
 * `message` says why it closed. A PIN pad, confirmation or choice it opened
 * (Save, Delete) asks about something that is gone, so it is refused too.
 */
export function useCloseWhenGone(gone: boolean, onClose: () => void, message?: string): void {
  useEffect(() => {
    if (!gone) return;
    refuseDialogs();
    onClose();
    if (message) toast(message);
  }, [gone]);
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
  const { scrim, content } = useOverlay(onClose);
  return portal(
    <>
      <div class="scrim" onClick={scrim} />
      <section class={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-label={title} onClickCapture={content}>
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
  const taps = useOverlay(onClose);
  return portal(
    <>
      <div class="scrim top" onClick={taps.scrim} />
      <div class="modal" role="dialog" aria-label={title} onClickCapture={taps.content}>
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
  const { scrim, content } = useOverlay(onClose);
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
      <div class="popover-scrim" onClick={scrim} />
      <div
        ref={ref}
        class="popover"
        role="dialog"
        onClickCapture={content}
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

/** Answer every open confirmation, choice and PIN request as cancelled. */
function refuseDialogs(): void {
  confirmReq.peek()?.resolve(false);
  confirmReq.value = null;
  chooseReq.peek()?.resolve(null);
  chooseReq.value = null;
  pinRequest.peek()?.resolve(false);
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 'min(36rem, 100%)' }}>
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
    // A field still being typed in (Add item's check or the keyboard's Done, after the lock relocked) would keep
    // the on-screen keyboard over the lower keys and take the digits typed on it: let go of it, so the keyboard closes.
    if (req && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, [req]);
  if (!req) return null;
  // nowMs re-renders the countdown each second, but it can be most of a second behind the exact time.
  const pausedFor = pauseSecondsLeft(pinPausedUntil.value, Math.max(nowMs.value, currentTime()));
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
