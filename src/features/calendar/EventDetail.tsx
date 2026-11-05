import { useEffect, useState } from 'preact/hooks';
import {
  Bell,
  CalendarDays,
  MapPin,
  Pencil,
  Repeat,
  RefreshCw,
  StickyNote,
  Timer,
  Trash2,
  UserRound,
  Users,
} from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { daysUntil, metaFor, profilesOf, seriesRecurrence } from '../../calendar/engine';
import { fromRecurrence } from '../../calendar/rrule';
import type { CalEvent } from '../../calendar/types';
import { toISODate } from '../../lib/date';
import { describeRepeat } from '../../lib/repeat';
import { Button, IconButton, Toggle } from '../../ui/controls';
import { choose, Popover } from '../../ui/overlays';
import { Avatar, ProfilePicker } from '../../ui/profile';
import { assignFlow, countdownFlow, deleteFlow } from './actions';
import { calendarName, countdownEmoji, plainText, reminderLabel, whenLabel, whoOf } from './model';
import { Unassigned } from './parts';
import { openEditor } from './state';

const ICON = { size: '2.2rem', strokeWidth: 1.8 };

function Row({ icon, children }: { icon: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="evd-row">
      <span class="evd-icon">{icon}</span>
      <div class="evd-body">{children}</div>
    </div>
  );
}

/** Series summary ("Weekdays", "Weekly on Thu, Sat"); loads the series' rule from the source. */
function useRepeatSummary(ev: CalEvent): string | null {
  const [text, setText] = useState<string | null>(ev.seriesId ? 'Repeats' : null);
  useEffect(() => {
    if (!ev.seriesId) return setText(null);
    let live = true;
    seriesRecurrence(ev)
      .then((lines) => {
        if (!live) return;
        const rule = fromRecurrence(lines);
        setText(rule ? describeRepeat(rule, toISODate(ev.start)) : lines.length ? 'Custom repeat' : 'Repeats');
      })
      .catch(() => live && setText('Repeats'));
    return () => {
      live = false;
    };
  }, [ev.key]);
  return text;
}

/** Anchored card for a tapped event. Read-only events still allow assignment and countdowns (app-side data). */
export function EventDetail({ ev, anchor, onClose }: { ev: CalEvent; anchor: DOMRect; onClose: () => void }) {
  const repeat = useRepeatSummary(ev);
  const [assigning, setAssigning] = useState(false);
  const [pick, setPick] = useState<string[]>(profilesOf(ev) ?? []);
  const [busy, setBusy] = useState(false);
  const meta = metaFor(ev);
  const who = whoOf(ev);
  const countdown = !!meta?.countdown;
  const until = daysUntil(toISODate(ev.start));
  const emoji = countdown ? countdownEmoji(ev) : meta?.emoji;
  const reminder = reminderLabel(ev.reminderMinutes);

  const saveAssign = async () => {
    let scope: 'series' | 'instance' = 'series';
    if (ev.seriesId) {
      const s = await choose('Assign profiles to', [
        { value: 'series', label: 'All events' },
        { value: 'instance', label: 'This event' },
      ]);
      if (!s) return;
      scope = s;
    }
    await assignFlow(ev, pick, scope);
    setAssigning(false);
  };

  return (
    <Popover anchor={anchor} onClose={onClose} width={48}>
      <div class="ev-detail" data-detail={ev.key}>
        <header class="evd-head">
          <h2 class="serif">
            {emoji && <span class="evd-emoji">{emoji}</span>}
            <span dir="auto">{ev.title}</span>
          </h2>
          {ev.editable && (
            <div class="evd-tools">
              <IconButton label="Edit" onClick={() => openEditor({ ev })} disabled={busy}>
                <Pencil size="2.2rem" />
              </IconButton>
              <IconButton
                label="Delete"
                class="danger"
                disabled={busy}
                onClick={async () => {
                  if (await deleteFlow(ev, setBusy)) onClose();
                }}
              >
                <Trash2 size="2.2rem" />
              </IconButton>
            </div>
          )}
        </header>
        {countdown && until >= 0 && (
          <Row icon={<Timer {...ICON} />}>{until === 0 ? 'Today' : `${until} ${until === 1 ? 'day' : 'days'} until event`}</Row>
        )}
        <Row icon={<CalendarDays {...ICON} />}>{whenLabel(ev)}</Row>
        {repeat && <Row icon={<Repeat {...ICON} />}>{repeat}</Row>}
        {reminder && <Row icon={<Bell {...ICON} />}>{reminder}</Row>}
        <Row icon={<Users {...ICON} />}>
          <div class="evd-sub">
            <span class="evd-label">Profiles</span>
            {!assigning && (
              <Button small variant="ghost" onClick={() => (setPick(profilesOf(ev) ?? []), setAssigning(true))}>
                {who.length ? 'Change' : 'Assign'}
              </Button>
            )}
          </div>
          {assigning ? (
            <div class="evd-assign">
              <ProfilePicker value={pick} onChange={setPick} everyone />
              <div class="row">
                <Button small onClick={() => setAssigning(false)}>
                  Cancel
                </Button>
                <Button small variant="primary" disabled={!pick.length} onClick={saveAssign}>
                  Save
                </Button>
              </div>
            </div>
          ) : who.length ? (
            <ul class="evd-people">
              {who.map((w) => (
                <li key={w.id}>
                  <Avatar profile={w.profile} size={2.8} />
                  {w.profile.name}
                </li>
              ))}
            </ul>
          ) : (
            <ul class="evd-people">
              <li>
                <Unassigned size={2.8} />
                Not assigned yet
              </li>
            </ul>
          )}
        </Row>
        <Row icon={<RefreshCw {...ICON} />}>
          <span class="evd-label">Synced calendar</span>
          <span>
            {calendarName(ev.calendarId)}
            {!ev.editable && <span class="muted"> (read-only)</span>}
          </span>
        </Row>
        {ev.organizer && (
          <Row icon={<UserRound {...ICON} />}>
            <span class="evd-label">Invited by</span>
            <span>{ev.organizer}</span>
          </Row>
        )}
        {ev.location && (
          <Row icon={<MapPin {...ICON} />}>
            <span dir="auto">{ev.location}</span>
          </Row>
        )}
        {ev.description && (
          <Row icon={<StickyNote {...ICON} />}>
            <span class="evd-notes" dir="auto">
              {plainText(ev.description)}
            </span>
          </Row>
        )}
        <div class="evd-toggle">
          <Timer {...ICON} />
          <span>Countdown</span>
          <Toggle label="Countdown" on={countdown} onChange={(on) => void countdownFlow(ev, on)} />
        </div>
      </div>
    </Popover>
  );
}
