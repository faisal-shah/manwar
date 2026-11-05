import { Fragment } from 'preact';
import { memo } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { ArrowDown, ArrowUp, ChevronRight, Inbox } from 'lucide-preact';
import { calendars, ensureRange, events, loadedRange, passesHidden, sync, syncNow, unassigned } from '../../calendar/engine';
import { profiles, settings } from '../../data/store';
import type { ISODate } from '../../data/types';
import { today } from '../../lib/clock';
import { addDays } from '../../lib/date';
import { plural } from '../../lib/text';
import { nowMinute } from '../../features/calendar/model';
import { EventWho } from '../../features/calendar/parts';
import { openDetail } from '../../features/calendar/state';
import { Button } from '../../ui/controls';
import { Avatar, everyoneProfile } from '../../ui/profile';
import { buildAgenda, dayTitle, freeLabel, type AgendaBlock, type AgendaRow } from './agenda';
import { hiddenBy, shownOf, tapPerson } from './filter';
import { agendaStart, calView, lookingAt, shownPeople } from './state';

/** Days the agenda shows at first, and how many more each time the end comes near. */
export const FIRST_DAYS = 21;
const MORE_DAYS = 28;
/** Start adding days this far (px) before the end of the list. */
const NEAR_END_PX = 900;

/**
 * The Calendar tab's agenda: the days from today (or a day gone to) with
 * their events, the person filter above, the events to assign first, and
 * a Today button once today is out of view. Scrolling near the end adds
 * days, fetching them first when they are past the loaded window.
 */
export const Agenda = memo(function Agenda() {
  const t = today.value;
  const userStart = agendaStart.value;
  const start = userStart ?? t;
  const [count, setCount] = useState(FIRST_DAYS);
  const list = useRef<HTMLDivElement>(null);
  const until = addDays(start, count - 1);
  const known = loadedRange.value;
  const s = sync.value;
  // Days outside the loaded window are not shown as empty: they wait for the fetch.
  const from = known && start < known.from ? null : start;
  const to = known ? (until < known.to ? until : addDays(known.to, -1)) : null;
  const complete = !!known && from !== null && to === until;

  useEffect(() => ensureRange(start, until), [start, until]);

  const everyone = profiles.value.map((p) => p.id);
  const hidden = hiddenBy(shownPeople.value, everyone);
  const shown = events.value.filter((ev) => passesHidden(ev, hidden));
  const blocks = from && to && from <= to ? buildAgenda(shown, from, to, nowMinute.value, settings.value.timeFormat, t) : [];
  const colors = new Map(calendars.value.map((c) => [c.id, c.color]));

  const [away, setAway] = useState<'up' | 'down' | null>(null);
  /** The day at the top and how far into it the list is scrolled, to hold it in place when today moves on. */
  const anchor = useRef<{ day: ISODate; into: number } | null>(null);
  /** More days were asked for and are not drawn yet: further scrolling does not ask again. */
  const growing = useRef(false);
  growing.current = false;

  /**
   * Which day is at the top (the header's month, the day + adds on) and
   * whether to offer Today; with `grow` (a scroll), more days near the end.
   * Only scrolling adds days, so a short list never fetches on its own.
   */
  const look = (grow = false) => {
    const el = list.current;
    if (!el) return;
    const top = el.scrollTop + 1;
    let at: { sec: HTMLElement; y: number } | null = null;
    for (const sec of el.querySelectorAll<HTMLElement>('[data-day]')) {
      const y = topIn(sec, el);
      if (y > top) break;
      at = { sec, y };
    }
    const day = (at?.sec.dataset.day as ISODate | undefined) ?? start;
    anchor.current = at ? { day, into: el.scrollTop - at.y } : null;
    const t0 = today.peek();
    lookingAt.value = day === t0 ? null : day;
    setAway(day === t0 && agendaStart.peek() === null ? null : day >= t0 ? 'up' : 'down');
    if (grow && complete && !growing.current && el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_END_PX) {
      growing.current = true;
      setCount((c) => c + MORE_DAYS);
    }
  };

  /*
   * Where the list stands when the day it starts on changes. Opening it, or
   * going to a day (or back to today), shows the start (today: with its Now
   * line in view); the day rolling over at midnight keeps the day being
   * looked at where it was.
   */
  const placed = useRef<{ start: ISODate; userStart: ISODate | null } | null>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el || !blocks.length) return;
    const last = placed.current;
    if (last && last.start === start) return;
    placed.current = { start, userStart };
    const rolledOver = last !== null && last.userStart === null && userStart === null;
    const keep = rolledOver && anchor.current && anchor.current.day >= start ? anchor.current : null;
    const sec = keep ? el.querySelector<HTMLElement>(`[data-day="${keep.day}"]`) : null;
    if (keep && sec) el.scrollTop = topIn(sec, el) + keep.into;
    else {
      if (last && !rolledOver) setCount(FIRST_DAYS);
      el.scrollTop = 0;
      if (start === t) scrollToNow(el);
    }
    look();
  });
  useLayoutEffect(() => look(), [blocks.length]);
  useEffect(
    () => () => {
      lookingAt.value = null;
    },
    [],
  );

  const backToToday = () => {
    const el = list.current;
    if (agendaStart.peek() === null && el) scrollToNow(el, true);
    agendaStart.value = null;
  };

  return (
    <div class="phc">
      <TopRow />
      <div class="phc-list" ref={list} onScroll={() => look(true)}>
        {!known ? (
          <p class="phc-state" role="status">
            {s.error ? 'The calendar could not be loaded yet.' : 'Loading the calendar…'}
          </p>
        ) : (
          blocks.map((b) => (b.kind === 'day' ? <Day key={b.day} block={b} colors={colors} /> : <Free key={b.from} block={b} />))
        )}
        {known && (
          <div class="phc-end">
            {complete ? (
              <Button variant="ghost" onClick={() => setCount((c) => c + MORE_DAYS)}>
                Show later days
              </Button>
            ) : s.loading ? (
              <span class="muted" role="status">
                Loading more days…
              </span>
            ) : (
              <>
                <span class="muted">These days are not loaded yet.</span>
                <Button variant="ghost" onClick={() => void syncNow()}>
                  Try again
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {away && (
        <button type="button" class="phc-today" onClick={backToToday}>
          {away === 'up' ? <ArrowUp size="1.8rem" /> : <ArrowDown size="1.8rem" />}
          Today
        </button>
      )}
    </div>
  );
});

/** Where `el` is in the scrolled content of `list` (offsetTop stops at each day: they contain their layout). */
const topIn = (el: Element, list: HTMLElement) =>
  el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;

/** Scroll today's Now line near the top when it is below the middle (or always, `force`). */
function scrollToNow(el: HTMLElement, force = false) {
  const line = el.querySelector<HTMLElement>('.phc-now');
  const behavior = force ? 'smooth' : 'auto';
  if (!line) return void (force && el.scrollTo({ top: 0, behavior }));
  const head = el.querySelector<HTMLElement>('.phc-day-head')?.offsetHeight ?? 0;
  const prev = (line.previousElementSibling as HTMLElement | null)?.offsetHeight ?? 0;
  const y = topIn(line, el);
  if (force || y - el.scrollTop > el.clientHeight / 2) el.scrollTo({ top: Math.max(0, y - head - prev - 8), behavior });
}

function Day({ block, colors }: { block: Extract<AgendaBlock, { kind: 'day' }>; colors: Map<string, string> }) {
  const t = today.value;
  const title = dayTitle(block.day, t);
  const { rows, nowAt } = block;
  return (
    <section class={`phc-day${block.day === t ? ' today' : ''}${block.day < t ? ' past' : ''}`} data-day={block.day}>
      <h2 class="phc-day-head">
        <span class="phc-day-name">{title.name}</span>
        <span class="phc-day-date">{title.date}</span>
      </h2>
      {rows.length === 0 ? (
        <p class="phc-none">Nothing planned</p>
      ) : (
        <ul class="phc-rows">
          {rows.map((r, i) => (
            <Fragment key={r.ev.key}>
              {nowAt === i && <NowLine />}
              <Row row={r} color={colors.get(r.ev.calendarId)} />
            </Fragment>
          ))}
          {nowAt === rows.length && <NowLine />}
        </ul>
      )}
    </section>
  );
}

function NowLine() {
  return (
    <li class="phc-now" aria-label="Now">
      <span>Now</span>
    </li>
  );
}

function Row({ row, color }: { row: AgendaRow; color?: string }) {
  const ev = row.ev;
  const sub = [row.span, ev.location].filter(Boolean);
  return (
    <li>
      <button
        type="button"
        class={`phc-ev${row.ended ? ' ended' : ''}${row.current ? ' current' : ''}`}
        data-event={ev.key}
        style={color ? { '--cal': color } : undefined}
        onClick={(e) => openDetail(ev, e.currentTarget)}
      >
        <span class={`phc-ev-time${row.allDay ? ' all-day' : ''}`}>
          <b>{row.start}</b>
          {row.end && <span>{row.end}</span>}
        </span>
        <span class="phc-ev-text">
          <span class="phc-ev-title" dir="auto">
            {ev.title}
          </span>
          {sub.length > 0 && (
            <span class="phc-ev-sub" dir="auto">
              {sub.join(' · ')}
            </span>
          )}
        </span>
        <EventWho ev={ev} size={3.2} max={3} />
      </button>
    </li>
  );
}

function Free({ block }: { block: Extract<AgendaBlock, { kind: 'free' }> }) {
  return (
    <div class="phc-free" data-day={block.from}>
      <span>{freeLabel(block.from, block.to)}</span>
      <span class="muted">Nothing planned</span>
    </div>
  );
}

/** Above the list: the events waiting to be assigned (when there are), and the person filter. */
function TopRow() {
  const waiting = unassigned.value.length;
  const all = profiles.value;
  if (!waiting && !all.length) return null;
  return (
    <div class="phc-top">
      {waiting > 0 && (
        <button type="button" class="phc-waiting" onClick={() => (calView.value = 'assign')}>
          <Inbox size="2rem" strokeWidth={2} />
          <span>{plural(waiting, 'event')} to assign</span>
          <ChevronRight size="1.8rem" />
        </button>
      )}
      <PeopleFilter />
    </div>
  );
}

/** Chips for the people to show: All, or one or more of them (kept on this phone). */
function PeopleFilter() {
  const all = profiles.value;
  if (!all.length) return null;
  const ids = all.map((p) => p.id);
  const on = shownOf(shownPeople.value, ids);
  const tap = (id: string | null) => (shownPeople.value = tapPerson(shownPeople.value, ids, id));
  return (
    <div class="phc-filter" role="group" aria-label="Show events for">
      <button type="button" class={`phc-chip${on.length ? '' : ' on'}`} aria-pressed={!on.length} onClick={() => tap(null)}>
        <Avatar profile={{ ...everyoneProfile(), name: 'All' }} size={2.8} />
        All
      </button>
      {all.map((p) => (
        <button
          type="button"
          key={p.id}
          class={`phc-chip${on.includes(p.id) ? ' on' : ''}`}
          aria-pressed={on.includes(p.id)}
          onClick={() => tap(p.id)}
        >
          <Avatar profile={p} size={2.8} />
          <bdi>{p.name}</bdi>
        </button>
      ))}
    </div>
  );
}
