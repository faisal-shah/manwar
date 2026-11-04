import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { Repeat } from 'lucide-preact';
import { unassigned } from '../../calendar/engine';
import { eventKey, type CalEvent } from '../../calendar/types';
import { Button, Empty } from '../../ui/controls';
import { Sheet, toast } from '../../ui/overlays';
import { ProfilePicker } from '../../ui/profile';
import { assignFlow } from './actions';
import { calendarName, whenLabel } from './model';

/** Series skipped in this session ("Skip for now"); they stay in the queue and the badge. */
const skipped = signal<Set<string>>(new Set());
const seriesOf = (ev: CalEvent) => eventKey(ev.calendarId, ev.seriesId ?? ev.id);

/**
 * Triage queue: events nobody is assigned to (invitations, events added on
 * phones, shared calendars). A parent picks who each one is for; recurring
 * events are assigned for the whole series. There are no automatic rules.
 */
export function TriageSheet({ onClose }: { onClose: () => void }) {
  const all = unassigned.value;
  const list = all.filter((ev) => !skipped.value.has(seriesOf(ev)));
  const hidden = all.length - list.length;
  return (
    <Sheet title="Assign events" onClose={onClose} wide>
      <p class="muted triage-intro">
        These events are not assigned to anyone yet. Choose who each one is for; repeating events are assigned for every
        occurrence.
      </p>
      {list.length ? (
        <div class="triage-list">
          {list.map((ev) => (
            <TriageRow key={seriesOf(ev)} ev={ev} />
          ))}
        </div>
      ) : (
        <Empty emoji="✅">
          {hidden ? `${hidden} skipped for now.` : 'All events are assigned.'}
          {hidden > 0 && (
            <Button small onClick={() => (skipped.value = new Set())}>
              Show skipped
            </Button>
          )}
        </Empty>
      )}
    </Sheet>
  );
}

function TriageRow({ ev }: { ev: CalEvent }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <article class="triage-row" data-triage={seriesOf(ev)}>
      <div class="triage-info">
        <h3 class="serif">{ev.title}</h3>
        <span>
          {whenLabel(ev)}
          {ev.seriesId && (
            <span class="triage-repeat">
              <Repeat size="1.6rem" /> repeats
            </span>
          )}
        </span>
        <span class="muted">
          {calendarName(ev.calendarId)}
          {ev.organizer ? ` · from ${ev.organizer}` : ''}
        </span>
      </div>
      <ProfilePicker value={sel} onChange={setSel} everyone />
      <div class="triage-actions">
        <Button
          variant="primary"
          disabled={!sel.length}
          onClick={() =>
            void assignFlow(ev, sel, 'series').then(() => {
              if (!unassigned.value.some((x) => seriesOf(x) === seriesOf(ev))) toast(`Assigned "${ev.title}"`);
            })
          }
        >
          Assign
        </Button>
        <Button variant="ghost" onClick={() => (skipped.value = new Set([...skipped.value, seriesOf(ev)]))}>
          Skip for now
        </Button>
      </div>
    </article>
  );
}
