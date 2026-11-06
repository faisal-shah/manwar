import { Check, RefreshCw } from 'lucide-preact';
import { demoMode } from '../../config';
import { calendars, defaultCalendarId, sync, syncNow, writableCalendars } from '../../calendar/engine';
import type { CalendarInfo } from '../../calendar/types';
import { asParent } from '../../core/lock';
import { hiddenChange } from '../../data/settings';
import { settings } from '../../data/store';
import { disconnect, googleProblem, session, startGoogleConnect } from '../../data/session';
import { nowMs } from '../../lib/clock';
import { Button } from '../../ui/controls';
import { confirm, toast } from '../../ui/overlays';
import { ColorSwatches } from '../../ui/pickers';
import { Avatar, everyoneProfile } from '../../ui/profile';
import { timeAgo } from '../messages/logic';
import { Group, NavRow, PageTitle, Row, ToggleRow, change } from './parts';

const Dot = ({ color }: { color: string }) => <span class="cal-dot" style={{ '--c': color }} aria-hidden="true" />;

function access(c: CalendarInfo): string {
  const role = c.accessRole === 'owner' || c.accessRole === 'writer' ? 'Events can be added' : 'Read only';
  return c.primary ? `Primary calendar · ${role}` : role;
}

export function GooglePage() {
  const s = settings.value;
  const st = sync.value;
  const hidden = s.hiddenCalendars;
  const target = defaultCalendarId();

  const problem = googleProblem.value;
  const status = problem ? (
    <span class="set-error">{problem}</span>
  ) : st.error ? (
    <span class="set-error">Sync failed: {st.error}</span>
  ) : st.loading ? (
    'Syncing now'
  ) : st.lastSync ? (
    `Last synced ${timeAgo(st.lastSync, nowMs.value)}`
  ) : (
    'Not synced yet'
  );

  const disconnectGoogle = async () => {
    const ok = await confirm('Disconnect Google?', {
      body: 'The wall signs out of the household Google account and stops showing its calendars until it is connected again. Tasks, lists, meals and other app data stay with the household.',
      ok: 'Disconnect',
      danger: true,
    });
    if (ok) await asParent(() => disconnect(), 'Enter the PIN to disconnect Google.');
  };

  return (
    <>
      <PageTitle>Google Calendar</PageTitle>
      <Group>
        <Row
          lead={<span class={`status-dot${st.error || problem ? ' bad' : ''}`} aria-hidden="true" />}
          label={demoMode ? 'Demo calendar (not Google)' : `Connected as ${session.value.account ?? 'the household account'}`}
          hint={status}
        >
          {problem ? (
            // Settings can stay open after the lock relocks, so this asks too. The wall goes to Google's
            // page and comes back reloaded; the result shows there (reconnectNote).
            <Button
              variant="primary"
              class="set-btn"
              onClick={() => void asParent(() => startGoogleConnect((m) => toast(m)), 'Enter the PIN to reconnect Google.')}
            >
              <RefreshCw size="2rem" />
              Reconnect
            </Button>
          ) : (
            <Button class="set-btn" disabled={st.loading} onClick={() => void syncNow()}>
              <RefreshCw size="2rem" />
              Sync now
            </Button>
          )}
        </Row>
      </Group>

      <Group title="Calendars on the wall" hint="Hidden calendars are not fetched or shown.">
        {calendars.value.map((c) => (
          <ToggleRow
            lead={<Dot color={c.color} />}
            label={c.name}
            hint={access(c)}
            on={!hidden.includes(c.id)}
            onChange={(on) => void change(hiddenChange('hiddenCalendars', c.id, !on))}
          />
        ))}
        {calendars.value.length === 0 && <p class="muted">No calendars loaded yet.</p>}
      </Group>

      <Group
        title="New events go to"
        hint="Events added on the wall are saved to this Google calendar; the event editor can pick another."
      >
        {writableCalendars.value.map((c) => (
          <NavRow
            lead={<Dot color={c.color} />}
            label={c.name}
            hint={hidden.includes(c.id) ? 'Hidden on the wall' : undefined}
            selected={c.id === target}
            trail={c.id === target ? <Check size="2.4rem" class="set-check" /> : null}
            onClick={() => void change({ defaultCalendarId: c.id })}
          />
        ))}
      </Group>

      <Group title="Everyone color" hint="The color of events assigned to the whole family.">
        <div class="set-row">
          <Avatar profile={everyoneProfile()} size={5.6} />
          <ColorSwatches value={s.familyColor} onChange={(familyColor) => void change({ familyColor })} />
        </div>
      </Group>

      <Group>
        <Button variant="danger" class="set-big" onClick={() => void disconnectGoogle()}>
          Disconnect Google
        </Button>
      </Group>
    </>
  );
}
