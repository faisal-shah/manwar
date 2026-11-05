import { useEffect, useState } from 'preact/hooks';
import {
  createEvent,
  defaultCalendarId,
  metaFor,
  profilesOf,
  seriesRecurrence,
  updateEvent,
  writableCalendars,
} from '../../calendar/engine';
import { fromRecurrence } from '../../calendar/rrule';
import { newEventId } from '../../calendar/types';
import { asParent } from '../../core/lock';
import { currentTime } from '../../lib/clock';
import { Button, Field, Toggle } from '../../ui/controls';
import { Sheet, toast } from '../../ui/overlays';
import { ProfilePicker } from '../../ui/profile';
import { RepeatEditor } from '../../ui/pickers';
import { settings } from '../../data/store';
import type { Repeat } from '../../data/types';
import { askScope, deleteFlow, errorToast } from './actions';
import {
  draftFromForm,
  formFromEvent,
  formProblem,
  newForm,
  sameRepeat,
  setAllDay,
  setEndTime,
  shiftStart,
  type Form,
} from './form';
import { calendarName, reminderLabel } from './model';
import { editorSaved, type EditorRequest } from './state';

const REMINDERS = [0, 5, 10, 15, 30, 60, 120, 1440];

type RepeatState = { status: 'none' } | { status: 'loading' } | { status: 'ok' } | { status: 'custom'; lines: string[] };

/** Right-hand Add / Edit Event sheet. */
export function EventEditor({ req, onClose }: { req: EditorRequest; onClose: () => void }) {
  const ev = req.ev;
  const [form, setForm] = useState<Form>(() =>
    ev
      ? formFromEvent(ev, profilesOf(ev) ?? [], !!metaFor(ev)?.countdown)
      : newForm(req.day, currentTime(), defaultCalendarId(), req.countdown),
  );
  const [rs, setRs] = useState<RepeatState>(ev?.seriesId ? { status: 'loading' } : { status: 'none' });
  /** The series' rule as loaded, to tell whether the repeat was changed. */
  const [loadedRule, setLoadedRule] = useState<Repeat | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** One id for the event this editor adds, kept across retries. */
  const [newId] = useState(newEventId);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  // A recurring event's rule comes from its series. Rules the editor cannot show are kept as they are.
  useEffect(() => {
    if (!ev?.seriesId) return;
    let live = true;
    seriesRecurrence(ev)
      .then((lines) => {
        if (!live) return;
        const rule = fromRecurrence(lines);
        if (rule) {
          setForm((f) => ({ ...f, repeat: rule }));
          setLoadedRule(rule);
          setRs({ status: 'ok' });
        } else setRs({ status: 'custom', lines });
      })
      .catch((e) => {
        if (!live) return;
        setRs({ status: 'custom', lines: [] });
        errorToast('Could not load the repeat rule', e);
      });
    return () => {
      live = false;
    };
  }, [ev?.key]);

  const problem = formProblem(form) ?? (rs.status === 'loading' ? 'Loading' : null);
  const writable = writableCalendars.value;

  const save = () =>
    asParent(async () => {
      const repeatChanged = !!ev?.seriesId && rs.status === 'ok' && !sameRepeat(form.repeat, loadedRule);
      const scope = ev ? await askScope(ev, 'Edit recurring event', repeatChanged) : 'all';
      if (!scope) return;
      const keep = rs.status === 'custom' || (!!ev?.seriesId && !repeatChanged);
      const draft = draftFromForm(form, keep);
      setBusy(true);
      try {
        if (ev) await updateEvent(ev, draft, scope, form.profiles, { countdown: form.countdown });
        else await createEvent(form.calendarId, newId, draft, form.profiles, { countdown: form.countdown });
        toast(ev ? 'Event saved' : 'Event added');
        editorSaved();
        onClose();
      } catch (e) {
        errorToast('Could not save the event', e);
        setBusy(false);
      }
    }, 'Enter the PIN to add or change events.');

  const reminderValues = [...REMINDERS];
  if (/^\d+$/.test(form.reminder) && !reminderValues.includes(Number(form.reminder))) reminderValues.push(Number(form.reminder));

  return (
    <Sheet
      title={ev ? 'Edit Event' : 'Add Event'}
      onClose={onClose}
      footer={
        <>
          {ev?.editable && (
            <Button
              variant="danger"
              class="cal-ed-delete"
              disabled={busy}
              onClick={async () => {
                if (await deleteFlow(ev, setBusy)) onClose();
              }}
            >
              Delete
            </Button>
          )}
          <span class="cal-ed-hint muted">{!busy && problem !== 'Loading' ? problem : ''}</span>
          <Button variant="primary" disabled={!!problem || busy} onClick={save} class="cal-ed-save">
            {busy ? 'Saving…' : ev ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div class="cal-editor">
        <Field label="Title">
          <input
            class="input"
            name="title"
            dir="auto"
            value={form.title}
            placeholder="Event title"
            autoFocus={!ev}
            onInput={(e) => set({ title: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <div class="cal-ed-toggle">
          <span>All day</span>
          <Toggle label="All day" on={form.allDay} onChange={(allDay) => setForm((f) => setAllDay(f, allDay))} />
        </div>

        <div class="cal-ed-times">
          <Field label="Starts">
            <div class="row">
              <input
                class="input"
                type="date"
                name="startDate"
                value={form.startDate}
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (v) setForm((f) => shiftStart(f, v, f.startTime));
                }}
              />
              {!form.allDay && (
                <input
                  class="input"
                  type="time"
                  name="startTime"
                  value={form.startTime}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    if (v) setForm((f) => shiftStart(f, f.startDate, v));
                  }}
                />
              )}
            </div>
          </Field>
          <Field label="Ends">
            <div class="row">
              <input
                class="input"
                type="date"
                name="endDate"
                value={form.endDate}
                min={form.startDate}
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (v) set({ endDate: v });
                }}
              />
              {!form.allDay && (
                <input
                  class="input"
                  type="time"
                  name="endTime"
                  value={form.endTime}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    if (v) setForm((f) => setEndTime(f, v));
                  }}
                />
              )}
            </div>
          </Field>
        </div>

        <Field label="Who">
          <ProfilePicker value={form.profiles} onChange={(profiles) => set({ profiles })} everyone />
        </Field>

        <Field label="Repeats">
          {rs.status === 'loading' && <span class="muted">Loading the repeat rule…</span>}
          {rs.status === 'custom' && (
            <span class="muted">This event has a custom repeat rule from Google Calendar. It is kept as it is.</span>
          )}
          {(rs.status === 'none' || rs.status === 'ok') && (
            <RepeatEditor value={form.repeat} start={form.startDate} onChange={(repeat) => set({ repeat })} />
          )}
        </Field>

        <Field label="Calendar">
          {ev ? (
            <span>{calendarName(ev.calendarId)}</span>
          ) : writable.length ? (
            <select
              class="input"
              name="calendar"
              value={form.calendarId}
              onChange={(e) => set({ calendarId: (e.target as HTMLSelectElement).value })}
            >
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {settings.value.hiddenCalendars.includes(c.id) ? `${c.name} (hidden on the wall)` : c.name}
                </option>
              ))}
            </select>
          ) : (
            <span class="muted">No calendar on the household account can be written to.</span>
          )}
        </Field>

        <Field label="Reminder">
          <select
            class="input"
            name="reminder"
            value={form.reminder}
            onChange={(e) => set({ reminder: (e.target as HTMLSelectElement).value })}
          >
            {form.reminder === 'default' && <option value="default">Calendar default</option>}
            <option value="none">No reminder</option>
            {reminderValues.map((m) => (
              <option key={m} value={String(m)}>
                {reminderLabel(m)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Location">
          <input
            class="input"
            name="location"
            dir="auto"
            value={form.location}
            onInput={(e) => set({ location: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <Field label="Notes">
          <textarea
            class="input"
            name="notes"
            dir="auto"
            value={form.notes}
            onInput={(e) => set({ notes: (e.target as HTMLTextAreaElement).value })}
          />
        </Field>

        <div class="cal-ed-toggle">
          <span>Countdown</span>
          <Toggle label="Countdown" on={form.countdown} onChange={(countdown) => set({ countdown })} />
        </div>
      </div>
    </Sheet>
  );
}
