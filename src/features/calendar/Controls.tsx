import { useState } from 'preact/hooks';
import { ChevronDown, ChevronLeft, ChevronRight, EyeOff, Inbox } from 'lucide-preact';
import { unassigned } from '../../calendar/engine';
import type { CalendarView } from '../../data/types';
import { FilterMenu } from './Filter';
import { Menu } from './Menu';
import { VIEWS, goToday, page, setView, triageOpen, viewLabel, type CalNav } from './state';

type Open = { kind: 'view' | 'filter'; rect: DOMRect } | null;

const rectOf = (e: MouseEvent) => (e.currentTarget as Element).getBoundingClientRect();

/**
 * View dropdown, Filter, triage, and < Today >. `compact` (Home pane) keeps
 * only the view dropdown and paging.
 */
export function NavControls({ nav, compact }: { nav: CalNav; compact?: boolean }) {
  const [open, setOpen] = useState<Open>(null);
  const n = unassigned.value.length;
  const atToday = nav.focus.value === null;
  return (
    <div class="ctl-group cal-ctls">
      {!compact && n > 0 && (
        <button
          type="button"
          class="ctl triage-btn"
          onClick={() => (triageOpen.value = true)}
          aria-label={`${n} events to assign`}
        >
          <Inbox size="2rem" strokeWidth={1.8} />
          To assign
          <span class="triage-count">{n}</span>
        </button>
      )}
      <button
        type="button"
        class={`ctl cal-view-btn${open?.kind === 'view' ? ' on' : ''}`}
        aria-haspopup="menu"
        onClick={(e) => setOpen({ kind: 'view', rect: rectOf(e) })}
      >
        {viewLabel(nav.view.value)}
        <ChevronDown size="2rem" />
      </button>
      {!compact && (
        <button
          type="button"
          class={`ctl cal-filter-btn${open?.kind === 'filter' ? ' on' : ''}`}
          onClick={(e) => setOpen({ kind: 'filter', rect: rectOf(e) })}
        >
          <EyeOff size="2rem" strokeWidth={1.8} />
          Filter
        </button>
      )}
      <button type="button" class="ctl ctl-round" aria-label="Previous" onClick={() => page(nav, -1)}>
        <ChevronLeft size="2.2rem" />
      </button>
      <button type="button" class={`ctl cal-today-btn${atToday ? ' at' : ''}`} onClick={() => goToday(nav)}>
        Today
      </button>
      <button type="button" class="ctl ctl-round" aria-label="Next" onClick={() => page(nav, 1)}>
        <ChevronRight size="2.2rem" />
      </button>
      {open?.kind === 'view' && (
        <ViewMenu
          anchor={open.rect}
          value={nav.view.value}
          onPick={(v) => {
            setOpen(null);
            setView(nav, v);
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === 'filter' && <FilterMenu anchor={open.rect} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ViewMenu({
  anchor,
  value,
  onPick,
  onClose,
}: {
  anchor: DOMRect;
  value: CalendarView;
  onPick: (v: CalendarView) => void;
  onClose: () => void;
}) {
  return (
    <Menu anchor={anchor} onClose={onClose} width={26} label="Calendar view">
      <div class="cal-view-menu" role="menu">
        {VIEWS.map((v) => (
          <button
            type="button"
            role="menuitemradio"
            aria-checked={v.value === value}
            key={v.value}
            class={v.value === value ? 'on' : ''}
            onClick={() => onPick(v.value)}
          >
            <span class="radio" />
            {v.label}
          </button>
        ))}
      </div>
    </Menu>
  );
}
