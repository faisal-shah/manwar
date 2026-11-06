import type { RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { daysOf, type CalEvent } from '../../../calendar/types';
import { settings } from '../../../data/store';
import type { ISODate } from '../../../data/types';
import { today } from '../../../lib/clock';
import { addDays, dateRange, dayShort, diffDays, fromISODate, isWeekend, monthShort, startOfMonth } from '../../../lib/date';
import { layoutMonthWeek, type WeekBar } from '../layout';
import { itemsByDay, type DayItems, type MealItem } from '../model';
import { EventPill, MealPill } from '../parts';
import { remPx } from '../gestures';
import { dayPopup, periodOf, type CalNav } from '../state';
import { DayWeather, NotLoaded } from './common';

/** Week row pieces, in rem: the date line, one item line, the gap between rows. */
const HEAD = 3;
const LINE = 2.7;
const GAP = 0.2;

/** Item lines that fit `h` rem of a week row under its date line. */
const fits = (h: number) => Math.max(0, Math.floor((h - HEAD - GAP) / (LINE + GAP)));

interface Fit {
  /** Lines in every week row. */
  lines: number;
  /** Lines in the last week's last day: the + button floats over its lower part (0: only "N more"). */
  corner: number;
}

/**
 * As many item lines as the week rows have room for, so a tall month shows
 * more and a short one (large text, six weeks, the Home pane) never cuts
 * "N more" off.
 */
function useFit(ref: RefObject<HTMLElement | null>, weeks: number): Fit {
  const [fit, setFit] = useState<Fit>({ lines: 3, corner: 3 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rem = remPx();
      const box = el.getBoundingClientRect();
      const rowPx = box.height / weeks;
      // At least one line, for "N more".
      const lines = Math.max(1, fits(rowPx / rem));
      let corner = lines;
      const fab = document.querySelector('.fab')?.getBoundingClientRect();
      const lastTop = box.bottom - rowPx;
      if (fab && fab.left < box.right && fab.right > box.right - box.width / 7 && fab.top < box.bottom && fab.bottom > lastTop)
        corner = Math.min(lines, fits((fab.top - lastTop) / rem - GAP));
      setFit((f) => (f.lines === lines && f.corner === corner ? f : { lines, corner }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [weeks]);
  return fit;
}

/** 7-column month grid: as many items per day as fit, or one line fewer plus "N more" opening the day popup. */
export function MonthView({ nav }: { nav: CalNav }) {
  const p = periodOf(nav);
  const items = itemsByDay(p.from, p.to);
  const weeks: ISODate[][] = [];
  for (let d = p.from; d <= p.to; d = addDays(d, 7)) weeks.push(dateRange(d, addDays(d, 6)));
  const grid = useRef<HTMLDivElement>(null);
  const fit = useFit(grid, weeks.length);
  return (
    <div class="monthv">
      <div class="month-head">
        {weeks[0].map((d) => (
          <span key={d} class="serif">
            {dayShort(fromISODate(d).getDay())}
          </span>
        ))}
      </div>
      <div class="month-weeks" ref={grid} style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w, i) => (
          <MonthWeek
            key={w[0]}
            days={w}
            items={items}
            month={p.month!}
            lines={i === weeks.length - 1 ? [...Array(6).fill(fit.lines), fit.corner] : fit.lines}
          />
        ))}
      </div>
    </div>
  );
}

type Single = { id: string } & ({ ev: CalEvent } | { meal: MealItem });

function MonthWeek({
  days,
  items,
  month,
  lines,
}: {
  days: ISODate[];
  items: Map<ISODate, DayItems>;
  month: ISODate;
  lines: number | number[];
}) {
  const first = days[0];
  const last = days[6];
  const t = today.value;
  const dim = settings.value.dimPast;
  const shade = settings.value.shadeWeekends;

  const bars: (WeekBar & { ev: CalEvent })[] = [];
  const seen = new Set<string>();
  const singles: Single[][] = days.map(() => []);
  // All-day events, then meals, then timed events: a meal plan never pushes an event into "more".
  days.forEach((d, col) => {
    const it = items.get(d)!;
    for (const ev of it.long) {
      const covered = daysOf(ev);
      if (covered.length === 1) {
        singles[col].push({ id: ev.key, ev });
        continue;
      }
      if (seen.has(ev.key)) continue;
      seen.add(ev.key);
      const a = covered[0] < first ? first : covered[0];
      const b = covered[covered.length - 1] > last ? last : covered[covered.length - 1];
      bars.push({
        id: ev.key,
        from: diffDays(first, a),
        to: diffDays(first, b),
        contStart: covered[0] < first,
        contEnd: covered[covered.length - 1] > last,
        ev,
      });
    }
    it.meals.forEach((m) => singles[col].push({ id: m.key, meal: m }));
    it.timed.forEach((ev) => singles[col].push({ id: ev.key, ev }));
  });
  const lay = layoutMonthWeek(
    bars,
    singles.map((s) => s.map((x) => x.id)),
    lines,
  );
  const most = typeof lines === 'number' ? lines : Math.max(...lines);
  const barById = new Map(bars.map((b) => [b.id, b.ev]));
  const singleById = new Map(singles.flat().map((s) => [s.id, s]));
  const openDay = (d: ISODate) => (e: MouseEvent) => {
    const cell = (e.currentTarget as HTMLElement).closest('.month-week')?.querySelector(`[data-day="${d}"]`) ?? e.currentTarget;
    dayPopup.value = { day: d, anchor: (cell as Element).getBoundingClientRect() };
  };

  return (
    <div class="month-week" style={{ gridTemplateRows: `${HEAD}rem repeat(${most}, ${LINE}rem) 1fr` }}>
      {days.map((d, col) => {
        const cls = ['mcell'];
        if (startOfMonth(d) !== month) cls.push('other');
        if (dim && d < t) cls.push('cal-past-day');
        if (shade && isWeekend(d)) cls.push('cal-weekend');
        const n = fromISODate(d).getDate();
        return (
          <button
            type="button"
            key={d}
            class={cls.join(' ')}
            data-day={d}
            style={{ gridColumn: String(col + 1), gridRow: '1 / -1' }}
            onClick={openDay(d)}
            aria-label={`Show ${d}`}
          >
            <DayWeather day={d} size={2.2} />
            <span class={`mnum${d === t ? ' today' : ''}`}>{n === 1 ? `${monthShort(fromISODate(d).getMonth())} 1` : n}</span>
            <NotLoaded day={d} />
          </button>
        );
      })}
      {lay.bars.map((b) => (
        <div
          key={`${b.id}:${b.col0}`}
          class="month-item"
          style={{ gridColumn: `${b.col0 + 1} / ${b.col1 + 2}`, gridRow: String(b.line + 2) }}
        >
          <EventPill ev={barById.get(b.id)!} bar={b} />
        </div>
      ))}
      {lay.singles.map((s) => {
        const it = singleById.get(s.id)!;
        return (
          // An overnight event is a single on both of its days, so the key needs the column.
          <div key={`${s.id}@${s.col}`} class="month-item" style={{ gridColumn: String(s.col + 1), gridRow: String(s.line + 2) }}>
            {'meal' in it ? <MealPill item={it.meal} /> : <EventPill ev={it.ev} day={days[s.col]} />}
          </div>
        );
      })}
      {lay.more.map((m) => (
        <button
          type="button"
          key={`more${m.col}`}
          class="month-more"
          style={{ gridColumn: String(m.col + 1), gridRow: String(m.line + 2) }}
          onClick={openDay(days[m.col])}
        >
          {m.count} more
        </button>
      ))}
    </div>
  );
}
