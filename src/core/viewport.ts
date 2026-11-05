/**
 * The on-screen keyboard and the design scale.
 *
 * `1rem` follows the viewport (`styles/base.css`), so a keyboard that shrinks
 * the viewport would shrink the whole wall to half size while someone types.
 * The page declares `interactive-widget=resizes-content` (index.html), so
 * Chrome resizes the layout viewport to the space above the keyboard, as the
 * Android WebView under Fully Kiosk does with its default adjustResize: one
 * behaviour on both. Sheets, dialogs and popovers are fixed to that viewport,
 * so they end above the keyboard and their footers stay reachable.
 *
 * What must not follow is the scale. When the viewport loses height at the
 * same width while a text field has focus, that is the keyboard: the root
 * keeps the full height in `--app-h` (the rem formula reads it), and the
 * focused field is scrolled into view inside its sheet or list. The shell
 * stays exactly the shrunk viewport's height and the rail clips what no
 * longer fits (app/shell.css), so only that scroller moves, never the page
 * with its top bar. The next resize that is not the keyboard (closed,
 * rotated, a real window change) lets go.
 */

const EDITABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [contenteditable]';

function typing(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el.matches(EDITABLE) ? el : null;
}

let started = false;

export function keepScaleWithKeyboard(): void {
  if (started) return;
  started = true;
  const root = document.documentElement;
  let full = { w: window.innerWidth, h: window.innerHeight };
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const field = typing();
    if (field && w === full.w && h < full.h) {
      root.style.setProperty('--app-h', `${full.h}px`);
      requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest' }));
    } else {
      full = { w, h };
      root.style.removeProperty('--app-h');
    }
  });
}

/**
 * The phone: its scale is the phone's own text size, not the viewport, so
 * only the field being typed in needs following. Chrome on Android resizes
 * the page to the space above the on-screen keyboard (resizes-content).
 * Safari on iPhone has no interactive-widget: the page keeps its height and
 * only the visual viewport shrinks above the keyboard (and pans to the
 * field), so the shell, sheets and toasts, fixed to the page, would end
 * under the keyboard. The visual viewport's gaps to the page's top and
 * bottom go in `--vv-top` and `--vv-bottom` (both 0 where the page itself
 * resizes), and phone.css ends those above the keyboard. Whenever the
 * space shrinks while a field has focus, the field is scrolled back into
 * view inside its sheet, as the wall does.
 */
export function keepFieldAboveKeyboard(): void {
  if (started) return;
  started = true;
  const root = document.documentElement;
  const vv = window.visualViewport;
  const visible = () => vv?.height ?? window.innerHeight;
  let h = visible();
  const follow = () => {
    if (vv) {
      // Pinch-zoomed (Safari zooms past user-scalable=no), the page is magnified, not under a keyboard.
      const zoomed = Math.abs(vv.scale - 1) > 0.01;
      const top = zoomed ? 0 : Math.max(0, Math.round(vv.offsetTop));
      const bottom = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - vv.offsetTop - vv.height));
      root.style.setProperty('--vv-top', `${top}px`);
      root.style.setProperty('--vv-bottom', `${bottom}px`);
    }
    const field = typing();
    const now = visible();
    if (field && now < h) requestAnimationFrame(() => field.scrollIntoView({ block: 'nearest' }));
    h = now;
  };
  window.addEventListener('resize', follow);
  vv?.addEventListener('resize', follow);
  vv?.addEventListener('scroll', follow);
}
