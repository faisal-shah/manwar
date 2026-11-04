import { toUnit, weather } from '../../../core/weather';
import { settings } from '../../../data/store';
import type { ISODate } from '../../../data/types';
import { today } from '../../../lib/clock';
import { dayLong, dayShort, fromISODate } from '../../../lib/date';
import { WeatherIcon } from '../../../ui/WeatherIcon';

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
