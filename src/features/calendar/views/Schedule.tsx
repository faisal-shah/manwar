import { useLayoutEffect, useRef } from 'preact/hooks';
import { daysOf } from '../../../calendar/engine';
import type { CalEvent } from '../../../calendar/types';
import { settings } from '../../../data/store';
import type { ISODate } from '../../../data/types';
import { now, today } from '../../../lib/clock';
import { dateRange, diffDays, formatTime, isWeekend } from '../../../lib/date';
import { layoutLanes, packRows, periodHasToday, segmentOn } from '../layout';
import { fillStyle, isPast, isUnassigned, itemsByDay, nowMinute, timeLabel, type DayItems, type MealItem } from '../model';
import { EventPill, EventWho, MealPill } from '../parts';
import { HOUR_MAX, HOUR_MIN, hourHeight, openDetail, periodOf, todayPressed, type CalNav } from '../state';
import { remPx, usePinchZoom } from '../gestures';
import { DayLabel, DayWeather } from './common';

/** Multi-day time grid: day headers, all-day row, hour gutter, events in lanes, now-line. */
export function ScheduleView({ nav }: { nav: CalNav }) {
  const p = periodOf(nav);
  const days = dateRange(p.from, p.to);
  const items = itemsByDay(p.from, p.to);
  const H = hourHeight.value;
  const scroller = useRef<HTMLDivElement>(null);
  const shade = settings.value.shadeWeekends;
  const t = today.value;
  const hasToday = periodHasToday(p, t);

  usePinchZoom(
    scroller,
    () => hourHeight.value,
    (v) => (hourHeight.value = v),
    HOUR_MIN,
    HOUR_MAX,
  );

  // Open near the current time (or the day's first event) on each new period and on Today.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let min: number;
    if (hasToday) min = now.value.getHours() * 60 + now.value.getMinutes() - 50;
    else {
      const starts = days.flatMap((d) => items.get(d)!.timed.map((ev) => segmentOn(ev, d).startMin));
      min = (starts.length ? Math.min(8 * 60, ...starts) : 8 * 60) - 30;
    }
    el.scrollTop = Math.max(0, (min / 60) * hourHeight.value * remPx());
  }, [p.from, p.to, todayPressed.value]);

  const cols = { '--cols': String(days.length), '--hour-h': `${H}rem` };
  return (
    <div class="sched" style={cols}>
      <div class="sched-head">
        <div />
        {days.map((d) => (
          <div class={`sched-day${shade && isWeekend(d) ? ' cal-weekend' : ''}`} key={d}>
            <DayLabel day={d} />
            <DayWeather day={d} size={2.6} />
          </div>
        ))}
      </div>
      <AllDayRow days={days} items={items} shade={shade} />
      <div class="sched-scroll scroll" ref={scroller}>
        <div class="sched-grid" style={{ height: `${24 * H}rem` }}>
          <div class="sched-hours" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} style={{ top: `${h * H}rem` }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d} day={d} items={items.get(d)!} H={H} shade={shade && isWeekend(d)} isToday={d === t} />
          ))}
        </div>
      </div>
    </div>
  );
}

const hourLabel = (h: number) => {
  const d = new Date(2026, 0, 1, h);
  return formatTime(d, settings.value.timeFormat);
};

const MIN_BLOCK = 0.9;
const GAP = 0.25;

function DayColumn({
  day,
  items,
  H,
  shade,
  isToday,
}: {
  day: ISODate;
  items: DayItems;
  H: number;
  shade: boolean;
  isToday: boolean;
}) {
  const segs = items.timed.map((ev) => ({ ev, ...segmentOn(ev, day) }));
  const placed = layoutLanes(
    segs,
    (s) => s.startMin,
    (s) => Math.max(s.endMin, s.startMin + 10),
  );
  const nowAt = new Date(nowMinute.value);
  const nowMin = nowAt.getHours() * 60 + nowAt.getMinutes();
  return (
    <div class={`sched-col${shade ? ' cal-weekend' : ''}`} data-day={day}>
      {placed.map(({ item: s, lane, lanes }) => {
        // A hairline gap keeps back-to-back blocks distinct.
        const top = (s.startMin / 60) * H + GAP / 2;
        const height = Math.max(((s.endMin - s.startMin) / 60) * H - GAP, MIN_BLOCK);
        return (
          <TimedBlock
            key={s.ev.key}
            ev={s.ev}
            style={{
              top: `${top}rem`,
              height: `${height}rem`,
              left: `calc(${(lane * 100) / lanes}% + 0.2rem)`,
              width: `calc(${100 / lanes}% - 0.4rem)`,
            }}
            short={height < 2.4}
          />
        );
      })}
      {isToday && (
        <div class="now-line" style={{ top: `${(nowMin / 60) * H}rem` }} aria-hidden="true">
          <span />
        </div>
      )}
    </div>
  );
}

function TimedBlock({ ev, style, short }: { ev: CalEvent; style: Record<string, string>; short: boolean }) {
  const cls = ['ev-block'];
  if (short) cls.push('short');
  if (isPast(ev)) cls.push('ev-past');
  if (isUnassigned(ev)) cls.push('ev-unassigned');
  return (
    <button
      type="button"
      class={cls.join(' ')}
      style={{ ...fillStyle(ev), ...style }}
      data-event={ev.key}
      aria-label={`${ev.title}, ${timeLabel(ev)}`}
      onClick={(e) => {
        e.stopPropagation();
        openDetail(ev, e.currentTarget as Element);
      }}
    >
      <span class="ev-text">
        <span class="ev-title" dir="auto">
          {ev.title}
        </span>
        <span class="ev-time">{timeLabel(ev)}</span>
      </span>
      <EventWho ev={ev} size={2.6} />
    </button>
  );
}

type AllDayEntry = { key: string; from: number; to: number } & (
  { meal: MealItem } | { ev: CalEvent; contL: boolean; contR: boolean }
);

/** All-day strip under the headers: meals as outlined pills, all-day events as bars (multi-day bars span columns). */
function AllDayRow({ days, items, shade }: { days: ISODate[]; items: Map<ISODate, DayItems>; shade: boolean }) {
  const first = days[0];
  const last = days[days.length - 1];
  const entries: AllDayEntry[] = [];
  days.forEach((d, i) => items.get(d)!.meals.forEach((meal) => entries.push({ key: meal.key, from: i, to: i, meal })));
  const seen = new Set<string>();
  for (const d of days) {
    for (const ev of items.get(d)!.long) {
      if (seen.has(ev.key)) continue;
      seen.add(ev.key);
      const covered = daysOf(ev);
      const a = covered[0] < first ? first : covered[0];
      const b = covered[covered.length - 1] > last ? last : covered[covered.length - 1];
      entries.push({
        key: ev.key,
        from: diffDays(first, a),
        to: diffDays(first, b),
        ev,
        contL: covered[0] < first,
        contR: covered[covered.length - 1] > last,
      });
    }
  }
  if (!entries.length) return null;
  const rows = packRows(entries);
  const n = Math.max(...rows) + 1;
  return (
    <div class="sched-allday scroll" style={{ '--rows': String(Math.min(n, 3)) }}>
      <div class="sched-allday-grid" style={{ gridTemplateRows: `repeat(${n}, 2.8rem)` }}>
        {days.map((d, i) => (
          <div
            key={d}
            class={`allday-bg${shade && isWeekend(d) ? ' cal-weekend' : ''}`}
            style={{ gridColumn: String(i + 2), gridRow: '1 / -1' }}
          />
        ))}
        {entries.map((e, k) => (
          <div
            key={e.key}
            class="allday-item"
            style={{ gridColumn: `${e.from + 2} / ${e.to + 3}`, gridRow: String(rows[k] + 1) }}
          >
            {'meal' in e ? (
              <MealPill item={e.meal} />
            ) : (
              <EventPill ev={e.ev} bar={{ startsHere: !e.contL, endsHere: !e.contR }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
