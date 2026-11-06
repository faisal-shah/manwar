import { isLoaded } from '../../../calendar/engine';
import { toUnit, weather } from '../../../core/weather';
import { settings } from '../../../data/store';
import type { ISODate } from '../../../data/types';
import { today } from '../../../lib/clock';
import { dayLong, dayShort, fromISODate } from '../../../lib/date';
import { WeatherIcon } from '../../../ui/WeatherIcon';
import { countLabel } from '../layout';

/*
 * A day outside the loaded window (paged past it, or past the offline
 * snapshot) is not known yet: its events may be missing, so it says so
 * instead of looking empty.
 */
const NOT_LOADED = 'Not loaded yet';

/** The note on a day outside the loaded window; nothing on a loaded one. */
export function NotLoaded({ day }: { day: ISODate }) {
  return isLoaded(day) ? null : <span class="cal-unloaded">{NOT_LOADED}</span>;
}

/** "No events", "3 events", or that the day is not loaded yet. */
export const dayCount = (day: ISODate, n: number) => (isLoaded(day) ? countLabel(n, false) : NOT_LOADED);

/** Daily forecast icon (next 10 days; Filter > Weather forecast). */
export function DayWeather({ day, size = 2.4 }: { day: ISODate; size?: number }) {
  const f = weather.value?.daily[day];
  if (!f || !settings.value.filter.weather) return null;
  const u = settings.value.tempUnit;
  return (
    <span class="cal-day-wx" title={`High ${toUnit(f.maxC, u)}°, low ${toUnit(f.minC, u)}°`}>
      <WeatherIcon code={f.code} size={size} />
    </span>
  );
}

/** "Wed 4" in the serif face, today's number in the red circle. */
export function DayLabel({ day, long }: { day: ISODate; long?: boolean }) {
  const d = fromISODate(day);
  const isToday = day === today.value;
  return (
    <span class={`cal-day-label serif${isToday ? ' today' : ''}`}>
      <span>{long ? dayLong(d.getDay()) : dayShort(d.getDay())}</span>
      <span class="num">{d.getDate()}</span>
    </span>
  );
}
