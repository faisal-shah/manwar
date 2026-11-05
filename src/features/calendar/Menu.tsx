import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useLayoutEffect, useState } from 'preact/hooks';
import { useOverlay } from '../../ui/overlays';
import { remPx } from './gestures';

/**
 * Dropdown card under a top-bar button (view switcher, Filter, countdowns).
 * The shared Popover centers beside its anchor, which suits event details;
 * menus open below the button instead, right-aligned when there is room.
 */
export function Menu({
  anchor,
  onClose,
  width = 36,
  label,
  children,
}: {
  anchor: DOMRect;
  onClose: () => void;
  width?: number;
  label: string;
  children: ComponentChildren;
}) {
  const { scrim, box } = useOverlay(onClose);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    const rem = remPx();
    const w = width * rem;
    const gap = 0.8 * rem;
    const vw = window.innerWidth;
    let left = anchor.right - w;
    if (left < gap) left = Math.min(anchor.left, vw - w - gap);
    const top = anchor.bottom + gap;
    setPos({ left: Math.max(gap, left), top, maxHeight: window.innerHeight - top - 2 * gap });
  }, [anchor, width]);
  return createPortal(
    <>
      <div class="popover-scrim" onClick={scrim} />
      <div
        {...box}
        class="popover cal-menu"
        role="dialog"
        aria-label={label}
        style={{
          width: `${width}rem`,
          left: pos?.left ?? -9999,
          top: pos?.top ?? 0,
          maxHeight: pos ? `${pos.maxHeight}px` : undefined,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
