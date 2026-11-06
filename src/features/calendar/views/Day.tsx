import { isLoaded } from '../../../calendar/engine';
import { settings } from '../../../data/store';
import type { ISODate } from '../../../data/types';
import { today } from '../../../lib/clock';
import { dayShort, formatLongDate, formatMonthYear, fromISODate, startOfMonth } from '../../../lib/date';
import { Empty } from '../../../ui/controls';
import { miniMonthDays } from '../layout';
import { dayEvents, itemsByDay } from '../model';
import { EventCard, MealPill } from '../parts';
import { periodOf, showDay, type CalNav } from '../state';
import { DayWeather, NotLoaded } from './common';

/** Mini month on the left third, the selected day's event cards on the right. */
export function DayView({ nav }: { nav: CalNav }) {
  const day = periodOf(nav).from;
  const items = itemsByDay(day, day).get(day)!;
  const events = dayEvents(items);
  return (
    <div class="dayv">
      <MiniMonth selected={day} onPick={(d) => showDay(nav, d)} />
      <section class="dayv-list">
        <header class="dayv-head">
          <h2 class="serif">{day === today.value ? 'Today' : formatLongDate(day)}</h2>
          <DayWeather day={day} size={3} />
        </header>
        <div class="dayv-items scroll">
          <NotLoaded day={day} />
          {items.meals.map((m) => (
            <MealPill key={m.key} item={m} badge />
          ))}
          {events.map((ev) => (
            <EventCard key={ev.key} ev={ev} />
          ))}
          {!events.length && !items.meals.length && isLoaded(day) && <Empty emoji="🗓️">Nothing on the calendar.</Empty>}
        </div>
      </section>
    </div>
  );
}

function MiniMonth({ selected, onPick }: { selected: ISODate; onPick: (d: ISODate) => void }) {
  const month = startOfMonth(selected);
  const ws = settings.value.weekStart;
  const days = miniMonthDays(month, ws);
  const t = today.value;
  return (
    <section class="cal-mini" aria-label={formatMonthYear(month)}>
      <h2 class="serif">{formatMonthYear(month)}</h2>
      <div class="cal-mini-grid">
        {days.slice(0, 7).map((d) => (
          <span key={`h${d}`} class="cal-mini-wd">
            {dayShort(fromISODate(d).getDay())}
          </span>
        ))}
        {days.map((d) => {
          const cls = ['cal-mini-day'];
          if (startOfMonth(d) !== month) cls.push('other');
          if (d < t) cls.push('past');
          if (d === t) cls.push('today');
          if (d === selected) cls.push('sel');
          return (
            <button type="button" key={d} class={cls.join(' ')} onClick={() => onPick(d)} aria-pressed={d === selected}>
              <span>{fromISODate(d).getDate()}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
