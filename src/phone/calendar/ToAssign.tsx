import { Fragment } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Check, Repeat } from 'lucide-preact';
import { assign, calendars, events, profilesOf, triageScope, unassigned } from '../../calendar/engine';
import { eventKey, type CalEvent } from '../../calendar/types';
import { requireParent } from '../../core/lock';
import { profiles } from '../../data/store';
import { EVERYONE, NOBODY } from '../../data/types';
import { sameAssignees, toggleAssignee } from '../../lib/assignees';
import { calendarName, whenLabel, whoOf } from '../../features/calendar/model';
import { openDetail } from '../../features/calendar/state';
import { useBack } from '../../ui/back';
import { Empty } from '../../ui/controls';
import { DOUBLE_TAP_MS, useOpeningTapGuard } from '../../ui/overlays';
import { Avatar, everyoneProfile } from '../../ui/profile';
import { calView } from './state';

type Scope = 'series' | 'instance';

const seriesOf = (ev: CalEvent) => eventKey(ev.calendarId, ev.seriesId ?? ev.id);

interface VisitRow {
  series: string;
  ev: CalEvent;
  scope: Scope;
  /** Assigned (here or on another device) since the view opened. */
  done: boolean;
}

/**
 * The rows of this visit: every event that waited for someone while the
 * view was open, in time order. An event assigned stays in its place,
 * showing who it is for (a tap there changes it), so the rows never shift
 * under a finger; the queue itself (`unassigned`, the tab's badge) drops it
 * at once. Each row keeps the scope the wall's triage gives it when it
 * first shows (`triageScope`): once a series has people, the next tap must
 * still change the series, not one occurrence.
 */
function useVisitRows(): VisitRow[] {
  const kept = useRef(new Map<string, { key: string; scope: Scope }>());
  const waiting = new Map(unassigned.value.map((ev) => [seriesOf(ev), ev]));
  for (const [series, ev] of waiting)
    if (!kept.current.has(series)) kept.current.set(series, { key: ev.key, scope: triageScope(ev) });
  const byKey = new Map(events.value.map((e) => [e.key, e]));
  const rows: VisitRow[] = [];
  for (const [series, k] of kept.current) {
    const ev = waiting.get(series) ?? byKey.get(k.key);
    // Gone (deleted, or past the window), or out of the queue without anyone (over): not a row any more.
    if (!ev || (!waiting.has(series) && !profilesOf(ev))) continue;
    rows.push({ series, ev, scope: k.scope, done: !waiting.has(series) });
  }
  return rows.sort((a, b) => a.ev.start.getTime() - b.ev.start.getTime() || a.series.localeCompare(b.series));
}

/** Calendar > To assign: the events nobody is assigned to, with a chip per person to assign each in one tap. */
export function ToAssign() {
  useBack(() => (calView.value = 'agenda'), true);
  // It opens where its button was: the rest of a double tap on that must not open or assign the first event.
  const guard = useOpeningTapGuard();
  const rows = useVisitRows();
  const left = unassigned.value.length;
  return (
    <div class="phc-assign" onClickCapture={guard}>
      <p class="muted phc-assign-intro">
        {left
          ? 'Tap who each event is for. A repeating event is assigned every time it repeats.'
          : rows.length
            ? 'All events are assigned.'
            : ''}
      </p>
      {rows.length ? rows.map((r) => <AssignRow key={r.series} row={r} />) : <Empty emoji="✅">All events are assigned.</Empty>}
    </div>
  );
}

/** What a tap writes stays shown until the store has it (a few milliseconds), or this long at most. */
const PENDING_MS = 3000;

function AssignRow({ row }: { row: VisitRow }) {
  const { ev, scope, done } = row;
  const [, redraw] = useState(0);
  const pending = useRef<{ ids: string[]; at: number } | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const stored = profilesOf(ev) ?? [];
  const p = pending.current;
  if (p && (sameAssignees(p.ids, stored) || performance.now() - p.at > PENDING_MS)) pending.current = null;
  const on = pending.current?.ids ?? stored;

  const tap = async (id: string) => {
    // The second tap of a double tap on the same chip would take back what the first did.
    const at = performance.now();
    const last = lastTap.current;
    lastTap.current = { id, at };
    if (last && last.id === id && at - last.at < DOUBLE_TAP_MS) return;
    if (!(await requireParent('Enter the PIN to assign events.'))) return;
    // From what the last tap wrote (the store may not show it yet), else the store's current assignment.
    const next = toggleAssignee(pending.current?.ids ?? profilesOf(ev) ?? [], id);
    pending.current = { ids: next, at: performance.now() };
    redraw((n) => n + 1);
    // Nobody: back in the queue (one occurrence of a series that has people says so itself).
    assign(ev, next.length ? next : scope === 'instance' ? [NOBODY] : [], scope);
  };

  const color = calendars.value.find((c) => c.id === ev.calendarId)?.color;
  const who = whoOf(ev);
  return (
    <article class={`phc-tri${done ? ' done' : ''}`} data-triage={row.series} style={color ? { '--cal': color } : undefined}>
      <button type="button" class="phc-tri-info" onClick={(e) => openDetail(ev, e.currentTarget)}>
        <h3 dir="auto">{ev.title}</h3>
        <span>{whenLabel(ev)}</span>
        <span class="muted">
          <bdi>{calendarName(ev.calendarId)}</bdi>
          {ev.organizer ? ` · from ${ev.organizer}` : ''}
        </span>
        {ev.seriesId && (
          <span class="phc-tri-repeat muted">
            <Repeat size="1.5rem" />
            {scope === 'series' ? 'Repeats: every time' : 'This time only'}
          </span>
        )}
      </button>
      <div class="phc-tri-chips" role="group" aria-label={`Who is ${ev.title} for?`}>
        <Chip id={EVERYONE} on={on.includes(EVERYONE)} onTap={tap} />
        {profiles.value.map((p) => (
          <Chip key={p.id} id={p.id} on={on.includes(p.id)} onTap={tap} />
        ))}
      </div>
      {done && who.length > 0 && (
        <p class="phc-tri-done" role="status">
          <Check size="1.8rem" strokeWidth={2.4} />
          {who[0].id === EVERYONE
            ? 'For everyone'
            : who.map((w, i) => (
                <Fragment key={w.id}>
                  {i ? ', ' : 'For '}
                  <bdi>{w.profile.name}</bdi>
                </Fragment>
              ))}
        </p>
      )}
    </article>
  );
}

function Chip({ id, on, onTap }: { id: string; on: boolean; onTap: (id: string) => void }) {
  const p = id === EVERYONE ? everyoneProfile() : profiles.value.find((x) => x.id === id)!;
  return (
    <button type="button" class={`phc-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => void onTap(id)}>
      <Avatar profile={p} size={2.8} />
      <bdi>{p.name}</bdi>
    </button>
  );
}
