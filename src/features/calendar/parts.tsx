import type { ComponentChildren } from 'preact';
import type { CalEvent } from '../../calendar/types';
import type { ISODate } from '../../data/types';
import { Avatar } from '../../ui/profile';
import { openMealsWeek } from '../meals/state';
import { fillStyle, isPast, isUnassigned, timeLabel, timePrefix, whoOf, type MealItem, type Who } from './model';
import { openDetail } from './state';

/** Avatars in a row, collapsing extras into "+N". */
export function Avatars({ who, size = 2.6, max = 3 }: { who: Who[]; size?: number; max?: number }) {
  const shown = who.length > max ? who.slice(0, max - 1) : who;
  const extra = who.length - shown.length;
  return (
    <span class="ev-avs">
      {shown.map((w) => (
        <Avatar key={w.id} profile={w.profile} size={size} />
      ))}
      {extra > 0 && (
        <span class="ev-more-av" style={{ width: `${size}rem`, height: `${size}rem`, fontSize: `${size * 0.42}rem` }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Grey "?" marker for events nobody is assigned to yet. */
export function Unassigned({ size = 2.2 }: { size?: number }) {
  return (
    <span class="ev-q" style={{ width: `${size}rem`, height: `${size}rem`, fontSize: `${size * 0.6}rem` }} title="Not assigned">
      ?
    </span>
  );
}

/** Avatars, or the "?" marker when unassigned. */
export function EventWho({ ev, size, max }: { ev: CalEvent; size?: number; max?: number }) {
  if (isUnassigned(ev)) return <Unassigned size={size ? size * 0.85 : undefined} />;
  return <Avatars who={whoOf(ev)} size={size} max={max} />;
}

const open = (ev: CalEvent) => (e: MouseEvent) => {
  e.stopPropagation();
  openDetail(ev, e.currentTarget as Element);
};

/** Full-width event card: title, time, avatars at the right (Day list, Week cells, day popups). */
export function EventCard({ ev, extra }: { ev: CalEvent; extra?: ComponentChildren }) {
  return (
    <button
      type="button"
      class={`ev-card${isPast(ev) ? ' ev-past' : ''}${isUnassigned(ev) ? ' ev-unassigned' : ''}`}
      style={fillStyle(ev)}
      onClick={open(ev)}
      data-event={ev.key}
    >
      <span class="ev-text">
        <span class="ev-title" dir="auto">
          {ev.title}
        </span>
        <span class="ev-time">{timeLabel(ev)}</span>
        {extra}
      </span>
      <EventWho ev={ev} size={3} />
    </button>
  );
}

/** Single-line month pill: "11:30 AM Title" or the title alone for all-day events. `day` is the cell it is drawn in. */
export function EventPill({ ev, bar, day }: { ev: CalEvent; bar?: { startsHere: boolean; endsHere: boolean }; day?: ISODate }) {
  const cls = ['ev-pill'];
  if (isPast(ev)) cls.push('ev-past');
  if (isUnassigned(ev)) cls.push('ev-unassigned');
  if (bar && !bar.startsHere) cls.push('cont-l');
  if (bar && !bar.endsHere) cls.push('cont-r');
  return (
    <button type="button" class={cls.join(' ')} style={fillStyle(ev)} onClick={open(ev)} data-event={ev.key}>
      {!ev.allDay && !bar && <span class="ev-prefix">{timePrefix(ev, day)}</span>}
      <span class="ev-title" dir="auto">
        {ev.title}
      </span>
      {isUnassigned(ev) && <Unassigned size={2.2} />}
    </button>
  );
}

/** Planned meal: outlined pill in the category color; opens the Meals tab at its week. */
export function MealPill({ item, badge }: { item: MealItem; badge?: boolean }) {
  return (
    <button
      type="button"
      class="cal-meal"
      style={{ '--c': item.category.color }}
      onClick={(e) => {
        e.stopPropagation();
        openMealsWeek(item.day);
      }}
      title={`${item.category.name}: ${item.meal.title}`}
    >
      {badge && <span class="cal-meal-badge">{item.category.name}</span>}
      <span class="ev-title" dir="auto">
        {item.meal.title}
      </span>
    </button>
  );
}
