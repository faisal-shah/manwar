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
