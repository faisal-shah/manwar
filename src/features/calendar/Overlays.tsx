import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { ISODate } from '../../data/types';
import { fromISODate, monthLong } from '../../lib/date';
import { Popover } from '../../ui/overlays';
import { EventDetail } from './EventDetail';
import { EventEditor } from './EventEditor';
import { countLabel } from './layout';
import { dayEvents, itemsByDay } from './model';
import { EventCard, MealPill } from './parts';
import { CountdownList } from './ProgressStrip';
import { countdownPopup, dayPopup, detailReq, editorReq, triageOpen } from './state';
import { TriageSheet } from './Triage';

/**
 * Popovers and sheets for whichever calendar surface is on screen (the
 * Calendar tab or the Home pane). Several surfaces may mount a host; only
 * the first one renders, so overlays never appear twice.
 */
const hosts = signal<number[]>([]);
let seq = 0;

export function CalendarOverlays() {
  const [id] = useState(() => ++seq);
  useEffect(() => {
    hosts.value = [...hosts.value, id];
    return () => {
      hosts.value = hosts.value.filter((h) => h !== id);
      if (!hosts.value.length) closeAll();
    };
  }, []);
  if (hosts.value[0] !== id) return null;
  const detail = detailReq.value;
  const editor = editorReq.value;
  const day = dayPopup.value;
  const cd = countdownPopup.value;
  return (
    <>
      {day && <DayPopup day={day.day} anchor={day.anchor} onClose={() => (dayPopup.value = null)} />}
      {cd && <CountdownList anchor={cd} onClose={() => (countdownPopup.value = null)} />}
      {detail && (
        <EventDetail key={detail.ev.key} ev={detail.ev} anchor={detail.anchor} onClose={() => (detailReq.value = null)} />
      )}
      {triageOpen.value && <TriageSheet onClose={() => (triageOpen.value = false)} />}
      {editor && <EventEditor req={editor} onClose={() => (editorReq.value = null)} />}
    </>
  );
}

function closeAll() {
  detailReq.value = null;
  editorReq.value = null;
  dayPopup.value = null;
  countdownPopup.value = null;
  triageOpen.value = false;
}

/** Month view: everything on one day ("November 25", "5 events", full cards). */
function DayPopup({ day, anchor, onClose }: { day: ISODate; anchor: DOMRect; onClose: () => void }) {
  const it = itemsByDay(day, day).get(day)!;
  const events = dayEvents(it);
  const d = fromISODate(day);
  return (
    <Popover anchor={anchor} onClose={onClose} width={44}>
      <div class="cal-day-popup" data-popup={day}>
        <h2 class="serif">{`${monthLong(d.getMonth())} ${d.getDate()}`}</h2>
        <span class="muted">{countLabel(events.length, false)}</span>
        <div class="cal-day-popup-items">
          {it.meals.map((m) => (
            <MealPill key={m.key} item={m} badge />
          ))}
          {events.map((ev) => (
            <EventCard key={ev.key} ev={ev} />
          ))}
        </div>
      </div>
    </Popover>
  );
}
