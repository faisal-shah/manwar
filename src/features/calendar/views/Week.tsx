import { Plus } from 'lucide-preact';
import { settings } from '../../../data/store';
import type { ISODate } from '../../../data/types';
import { today } from '../../../lib/clock';
import { addDays, dateRange, isWeekend } from '../../../lib/date';
import { countLabel, rangeLabel } from '../layout';
import { dayEvents, itemsByDay } from '../model';
import { EventCard, MealPill } from '../parts';
import { openEditor, page, periodOf, type CalNav } from '../state';
import { DayLabel, DayWeather } from './common';

/** 4x2 card grid: seven day cells and a Next Week cell. */
export function WeekView({ nav }: { nav: CalNav }) {
  const p = periodOf(nav);
  const days = dateRange(p.from, p.to);
  const items = itemsByDay(p.from, p.to);
  const t = today.value;
  const dim = settings.value.dimPast;
  const shade = settings.value.shadeWeekends;
  return (
    <div class="weekv">
      {days.map((d) => {
        const it = items.get(d)!;
        const events = dayEvents(it);
        const cls = ['cal-week-cell'];
        if (dim && d < t) cls.push('cal-past-day');
        if (shade && isWeekend(d)) cls.push('cal-weekend');
        return (
          <section key={d} class={cls.join(' ')} data-day={d}>
            <header class="cal-week-head">
              <div class="cal-wc-row">
                <DayLabel day={d} />
                <DayWeather day={d} size={2.8} />
              </div>
              <div class="cal-wc-row">
                <span class="cal-week-count">
                  {countLabel(events.length, false)}
                  {d === t && events.length > 0 && <span class="cal-week-today"> today</span>}
                </span>
                <AddOn day={d} />
              </div>
            </header>
            <div class="cal-week-items scroll">
              {it.meals.map((m) => (
                <MealPill key={m.key} item={m} badge />
              ))}
              {events.map((ev) => (
                <EventCard key={ev.key} ev={ev} day={d} />
              ))}
            </div>
          </section>
        );
      })}
      <button type="button" class="cal-week-cell cal-week-next" onClick={() => page(nav, 1)}>
        <span class="serif">Next Week</span>
        <span class="cal-week-count">{rangeLabel(addDays(p.to, 1), addDays(p.to, 7))}</span>
      </button>
    </div>
  );
}

function AddOn({ day }: { day: ISODate }) {
  return (
    <button type="button" class="cal-week-add" aria-label="Add event" onClick={() => openEditor({ day })}>
      <Plus size="1.8rem" strokeWidth={2.2} />
      <span class="cal-week-add-label">Add event</span>
    </button>
  );
}
