import { useState } from 'preact/hooks';
import { asParent } from '../../core/lock';
import { data, newId, profileById, profiles, saveEdited } from '../../data/store';
import type { PartOfDay, Task } from '../../data/types';
import { currentTime, today } from '../../lib/clock';
import { Button, Chips, Field, Segmented, Stepper, Toggle } from '../../ui/controls';
import { Sheet, toast, useCloseWhenGone } from '../../ui/overlays';
import { EmojiPicker, RepeatEditor } from '../../ui/pickers';
import { ProfilePicker } from '../../ui/profile';
import { archiveTask, editing } from './actions';
import {
  MAX_TASK_STARS,
  STAR_CHOICES,
  draftFrom,
  taskFrom,
  validateDraft,
  type AfterUnit,
  type Draft,
  type RepeatMode,
} from './draft';
import { SECTION_META } from './logic';
import { currentPart } from './view';

/** Mounted by the Tasks tab and the Home pane; opened through editTask() (parent PIN). */
export function EditorHost() {
  const e = editing.value;
  if (!e) return null;
  const task = e === 'new' ? null : e;
  return <TaskEditor key={task?.id ?? 'new'} task={task} onClose={() => (editing.value = null)} />;
}

const PARTS: PartOfDay[] = ['morning', 'afternoon', 'evening'];

function TaskEditor({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const [d, setD] = useState<Draft>(() => draftFrom(task, today.value, currentPart.value));
  const stored = task && data.tasks.value.find((t) => t.id === task.id);
  useCloseWhenGone(!!task && (!stored || !!stored.archived), onClose, `"${task?.title}" was deleted on another device.`);
  const [pickEmoji, setPickEmoji] = useState(false);
  const [customStars, setCustomStars] = useState(() => !STAR_CHOICES.includes(d.stars));
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => {
    setD({ ...d, ...p });
    setError(null);
  };
  const chore = d.kind === 'chore';

  // The lock may have relocked while the editor stood open, so saving asks again.
  const save = () => {
    // A profile deleted on another device while the editor was open is not saved back onto the task.
    const draft = { ...d, assignees: d.assignees.filter((id) => profileById.value.has(id)) };
    const problem = validateDraft(draft);
    if (problem) return setError(problem);
    void asParent(() => {
      const order = task?.order ?? Math.max(0, ...data.tasks.value.map((t) => t.order)) + 1;
      // The stored task, not the copy the editor opened with: a check-off meanwhile may have moved lastDone.
      const base = (task && data.tasks.value.find((t) => t.id === task.id)) ?? task;
      // Deleted on another device while the PIN pad was up: nothing to save onto.
      if (task && !data.tasks.value.some((t) => t.id === task.id)) return;
      const out = taskFrom(draft, base ?? { id: newId(), order, createdAt: currentTime() });
      void saveEdited('tasks', out, !task, [
        'kind',
        'title',
        'emoji',
        'notes',
        'assignees',
        'upForGrabs',
        'stars',
        'date',
        'time',
        'repeat',
        'repeatAfterDone',
        'parts',
      ]);
      toast(task ? `Saved "${out.title}"` : `Added "${out.title}"`);
      onClose();
    }, 'Enter the PIN to save the task.');
  };

  return (
    <Sheet
      title={task ? 'Edit task' : 'Add task'}
      onClose={onClose}
      footer={
        <>
          {task && (
            <Button variant="danger" style={{ marginRight: 'auto' }} onClick={() => archiveTask(task)}>
              Delete
            </Button>
          )}
          {error && (
            <span class="tk-ed-error" role="alert">
              {error}
            </span>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {task ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div class="tk-ed">
        <Segmented<'chore' | 'routine'>
          value={d.kind}
          options={[
            { value: 'chore', label: '🧹 Chore' },
            { value: 'routine', label: '🌤️ Routine' },
          ]}
          onChange={(kind) =>
            set({
              kind,
              repeat:
                kind === 'routine' && d.repeat.unit !== 'day' && d.repeat.unit !== 'week' ? { every: 1, unit: 'day' } : d.repeat,
            })
          }
        />
        <p class="muted tk-ed-hint">
          {chore
            ? 'A job with a due date. It can repeat on a schedule or a while after it is done.'
            : 'A habit for part of the day: Morning, Afternoon or Evening.'}
        </p>

        <Field label="Title">
          <div class="row">
            <button
              type="button"
              class={`tk-ed-emoji${pickEmoji ? ' on' : ''}`}
              aria-label={d.emoji ? `Emoji ${d.emoji}, change` : 'Add an emoji'}
              onClick={() => setPickEmoji(!pickEmoji)}
            >
              {d.emoji ?? '☺︎+'}
            </button>
            <input
              class="input grow"
              placeholder={chore ? 'e.g. Empty the dishwasher' : 'e.g. Brush teeth'}
              value={d.title}
              maxLength={60}
              aria-label="Title"
              onInput={(e) => set({ title: (e.target as HTMLInputElement).value })}
            />
          </div>
        </Field>
        {pickEmoji && (
          <div class="tk-ed-picker">
            <EmojiPicker
              value={d.emoji}
              onChange={(emoji) => {
                set({ emoji });
                if (emoji) setPickEmoji(false);
              }}
            />
          </div>
        )}

        <Field label={chore ? 'Who' : 'For'}>
          {chore && (
            <div class="row tk-ed-ufg">
              <Toggle label="Up for Grabs" on={d.upForGrabs} onChange={(upForGrabs) => set({ upForGrabs })} />
              <span>
                Up for Grabs <span class="muted">· anyone can claim it; the first to finish gets the stars</span>
              </span>
            </div>
          )}
          {!(chore && d.upForGrabs) && <ProfilePicker value={d.assignees} onChange={(assignees) => set({ assignees })} />}
          {profiles.value.length === 0 && <span class="muted">Add your family in Settings, under Profiles.</span>}
        </Field>

        <Field label="Stars">
          <div class="row" style={{ flexWrap: 'wrap' }}>
            <div class="chips">
              {STAR_CHOICES.map((n) => (
                <button
                  type="button"
                  class={`chip${!customStars && d.stars === n ? ' on' : ''}`}
                  aria-pressed={!customStars && d.stars === n}
                  onClick={() => {
                    setCustomStars(false);
                    set({ stars: n });
                  }}
                >
                  {n === 0 ? 'None' : `★ ${n}`}
                </button>
              ))}
              <button
                type="button"
                class={`chip${customStars ? ' on' : ''}`}
                aria-pressed={customStars}
                onClick={() => setCustomStars(true)}
              >
                Custom
              </button>
            </div>
            {customStars && (
              <input
                class="input"
                style={{ width: '12rem' }}
                inputMode="numeric"
                aria-label="Custom stars"
                value={String(d.stars)}
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 5);
                  set({ stars: v ? Number(v) : 0 });
                }}
              />
            )}
          </div>
          {customStars && <span class="muted">0 to {MAX_TASK_STARS} stars each time it is done.</span>}
        </Field>

        {chore ? (
          <>
            <Field label="When">
              <div class="row" style={{ flexWrap: 'wrap' }}>
                <input
                  class="input"
                  type="date"
                  style={{ width: 'auto' }}
                  aria-label="Date"
                  value={d.date}
                  onInput={(e) => set({ date: (e.target as HTMLInputElement).value })}
                />
                <Toggle label="Due time" on={d.timed} onChange={(timed) => set({ timed })} />
                <span>Due time</span>
                {d.timed && (
                  <input
                    class="input"
                    type="time"
                    style={{ width: 'auto' }}
                    aria-label="Time"
                    value={d.time}
                    onInput={(e) => set({ time: (e.target as HTMLInputElement).value })}
                  />
                )}
              </div>
            </Field>
            <Field label="Repeats">
              <Segmented<RepeatMode>
                value={d.repeatMode}
                options={[
                  { value: 'none', label: 'Once' },
                  { value: 'schedule', label: 'On a schedule' },
                  { value: 'after', label: 'After it is done' },
                ]}
                onChange={(repeatMode) => set({ repeatMode })}
              />
              {d.repeatMode === 'schedule' && (
                <RepeatEditor
                  value={d.repeat}
                  start={d.date}
                  units={['day', 'week', 'month', 'year']}
                  onChange={(r) => r && set({ repeat: r })}
                />
              )}
              {d.repeatMode === 'after' && (
                <div class="row" style={{ flexWrap: 'wrap' }}>
                  <span class="muted">Again</span>
                  <Stepper value={d.after.every} min={1} max={30} onChange={(every) => set({ after: { ...d.after, every } })} />
                  <Segmented<AfterUnit>
                    value={d.after.unit}
                    options={[
                      { value: 'day', label: d.after.every === 1 ? 'day' : 'days' },
                      { value: 'week', label: d.after.every === 1 ? 'week' : 'weeks' },
                      { value: 'month', label: d.after.every === 1 ? 'month' : 'months' },
                    ]}
                    onChange={(unit) => set({ after: { ...d.after, unit } })}
                  />
                  <span class="muted">after it is done</span>
                </div>
              )}
            </Field>
          </>
        ) : (
          <>
            <Field label="In the">
              <Chips<PartOfDay>
                multi
                value={d.parts}
                options={PARTS.map((p) => ({ value: p, label: `${SECTION_META[p].emoji} ${SECTION_META[p].label}` }))}
                onChange={(parts) => set({ parts: PARTS.filter((p) => parts.includes(p)) })}
              />
            </Field>
            <Field label="Repeats">
              <RepeatEditor value={d.repeat} start={d.date} units={['day', 'week']} onChange={(r) => r && set({ repeat: r })} />
            </Field>
          </>
        )}

        <Field label="Notes">
          <textarea
            class="input"
            placeholder="Steps or details (optional)"
            value={d.notes}
            maxLength={500}
            onInput={(e) => set({ notes: (e.target as HTMLTextAreaElement).value })}
          />
        </Field>
      </div>
    </Sheet>
  );
}
