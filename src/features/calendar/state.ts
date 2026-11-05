import { signal, type Signal } from '@preact/signals';
import { ensureRange } from '../../calendar/engine';
import type { CalEvent } from '../../calendar/types';
import { asParent } from '../../core/lock';
import { settings } from '../../data/store';
import type { CalendarView, ISODate } from '../../data/types';
import { today } from '../../lib/clock';
import { addDays } from '../../lib/date';
import { focusForView, pageFocus, periodTitle, viewPeriod, type NavSettings, type Period } from './layout';

/* ---------- Navigation ---------- */

/** Paging state for one calendar surface (the Calendar tab, or a Home pane). */
export interface CalNav {
  view: Signal<CalendarView>;
  /** Null while following today; see viewPeriod(). */
  focus: Signal<ISODate | null>;
  /** Direction of the last page turn, for the slide-in animation. */
  dir: Signal<-1 | 0 | 1>;
  /** Called after the view changes (the Home pane reports it to its owner). */
  onView?: (v: CalendarView) => void;
}

export const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'schedule', label: 'Schedule' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export const viewLabel = (v: CalendarView) => VIEWS.find((x) => x.value === v)!.label;

export function createNav(view: CalendarView): CalNav {
  return { view: signal(view), focus: signal(null), dir: signal(0) };
}

export function navSettings(): NavSettings {
  const s = settings.value;
  return {
    weekStart: s.weekStart,
    scheduleDays: s.scheduleDays,
    scheduleStartToday: s.scheduleStartToday,
    weekStartToday: s.weekStartToday,
    monthStartCurrentWeek: s.monthStartCurrentWeek,
  };
}

export const periodOf = (nav: CalNav): Period => viewPeriod(nav.view.value, nav.focus.value, today.value, navSettings());

export function page(nav: CalNav, dir: -1 | 1): void {
  nav.focus.value = pageFocus(nav.view.value, nav.focus.value, today.value, navSettings(), dir);
  nav.dir.value = dir;
  const p = periodOf(nav);
  // Week view also previews the next week.
  ensureRange(p.from, nav.view.value === 'week' ? addDays(p.to, 7) : p.to);
}

export function goToday(nav: CalNav): void {
  nav.dir.value = nav.focus.value === null ? 0 : nav.focus.value > today.value ? -1 : 1;
  nav.focus.value = null;
  todayPressed.value++;
}

/** Show a specific day (mini month taps, Week "+" cells). */
export function showDay(nav: CalNav, day: ISODate): void {
  nav.dir.value = 0;
  nav.focus.value = focusForView('day', nav.view.value, day, today.value, navSettings());
}

export function setView(nav: CalNav, v: CalendarView): void {
  if (v === nav.view.value) return;
  nav.focus.value = focusForView(nav.view.value, v, nav.focus.value, today.value, navSettings());
  nav.dir.value = 0;
  nav.view.value = v;
  nav.onView?.(v);
}

export const navTitle = (nav: CalNav) => periodTitle(nav.view.value, periodOf(nav), today.value);

/** Bumped by Today so the schedule grid scrolls back to now. */
export const todayPressed = signal(0);

/* ---------- Per-device preferences ---------- */

function stored<T>(key: string, fallback: T, valid: (v: unknown) => v is T): Signal<T> {
  let initial = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const v: unknown = JSON.parse(raw);
      if (valid(v)) initial = v;
    }
  } catch {
    /* storage unavailable: use the default */
  }
  const s = signal(initial);
  s.subscribe((v) => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  });
  return s;
}

const isView = (v: unknown): v is CalendarView => VIEWS.some((x) => x.value === v);
const isHour = (v: unknown): v is number => typeof v === 'number' && v >= HOUR_MIN && v <= HOUR_MAX;

export const HOUR_MIN = 3.6;
export const HOUR_MAX = 14;
/** Schedule hour height in rem (pinch or Ctrl+wheel to change). */
export const hourHeight = stored('manwar.cal.hourHeight', 5.6, isHour);
/** The Calendar tab's last view. */
export const savedView = stored<CalendarView>('manwar.cal.view', 'schedule', isView);

/* ---------- Overlays ---------- */

export interface EditorRequest {
  /** Edit this event; absent = new event. */
  ev?: CalEvent;
  /** New event on this day. */
  day?: ISODate;
  countdown?: boolean;
}

export const editorReq = signal<EditorRequest | null>(null);
export const detailReq = signal<{ ev: CalEvent; anchor: DOMRect } | null>(null);
export const dayPopup = signal<{ day: ISODate; anchor: DOMRect } | null>(null);
export const countdownPopup = signal<DOMRect | null>(null);
export const triageOpen = signal(false);

/**
 * When the editor last closed after saving. The + button sits right under
 * the editor's Save button, so the second tap of a double tap on Save must
 * not open a fresh editor.
 */
let savedAt = -Infinity;
const REOPEN_GUARD_MS = 500;

export function editorSaved(): void {
  savedAt = performance.now();
}

/** Open the event editor (asks for the parent PIN first when the lock is on). */
export function openEditor(req: EditorRequest = {}): void {
  if (performance.now() - savedAt < REOPEN_GUARD_MS) return;
  void asParent(() => {
    detailReq.value = null;
    dayPopup.value = null;
    editorReq.value = req;
  }, 'Enter the PIN to add or change events.');
}

export function openDetail(ev: CalEvent, el: Element): void {
  dayPopup.value = null;
  detailReq.value = { ev, anchor: el.getBoundingClientRect() };
}
