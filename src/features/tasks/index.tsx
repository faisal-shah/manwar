import { Check, ChevronDown, ChevronLeft, ChevronRight, EyeOff, House } from 'lucide-preact';
import { useState } from 'preact/hooks';
import type { TabDef } from '../../app/tab';
import { profiles } from '../../data/store';
import { formatHeaderDate } from '../../lib/date';
import { Segmented, SettingRow, Toggle } from '../../ui/controls';
import { Popover } from '../../ui/overlays';
import { Avatar } from '../../ui/profile';
import { editTask } from './actions';
import { DayView } from './DayView';
import { DEFAULT_FILTER, weekTitle, type TaskFilter } from './logic';
import { TasksOverlays } from './overlays';
import { UFG_COLOR } from './TaskCard';
import { dayOffset, firstDay, mode, selectedDay, taskFilter, weekOffset, weekStart } from './view';
import { WeekView } from './WeekView';
import './columns.css';
import './tasks.css';

function Controls() {
  const m = mode.value;
  const offset = m === 'day' ? dayOffset : weekOffset;
  const atStart = (m === 'day' ? selectedDay.value : weekStart.value) <= firstDay.value;
  const [filterAt, setFilterAt] = useState<DOMRect | null>(null);
  const f = taskFilter.value;
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTER);
  return (
    <div class="ctl-group">
      <Segmented<'day' | 'week'>
        value={m}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
        onChange={(v) => (mode.value = v)}
      />
      <button
        type="button"
        class={`ctl${filtered ? ' on' : ''}`}
        aria-haspopup="dialog"
        onClick={(e) => setFilterAt((e.currentTarget as HTMLElement).getBoundingClientRect())}
      >
        <EyeOff size="1.9rem" /> Filter <ChevronDown size="1.8rem" />
      </button>
      <button
        type="button"
        class="ctl ctl-round"
        aria-label={m === 'day' ? 'Previous day' : 'Previous week'}
        disabled={atStart}
        onClick={() => offset.value--}
      >
        <ChevronLeft size="2.2rem" />
      </button>
      <button type="button" class={`ctl${offset.value === 0 ? '' : ' on'}`} onClick={() => (offset.value = 0)}>
        {m === 'day' ? 'Today' : 'This Week'}
      </button>
      <button
        type="button"
        class="ctl ctl-round"
        aria-label={m === 'day' ? 'Next day' : 'Next week'}
        onClick={() => offset.value++}
      >
        <ChevronRight size="2.2rem" />
      </button>
      {filterAt && (
        <Popover anchor={filterAt} onClose={() => setFilterAt(null)} width={40}>
          <FilterMenu />
        </Popover>
      )}
    </div>
  );
}

function FilterMenu() {
  const f = taskFilter.value;
  const set = (p: Partial<TaskFilter>) => (taskFilter.value = { ...f, ...p });
  return (
    <div class="tk-filter" data-testid="tasks-filter">
      <h3 class="serif">Show</h3>
      <SettingRow label="Completed tasks">
        <Toggle label="Completed tasks" on={f.completed} onChange={(completed) => set({ completed })} />
      </SettingRow>
      <SettingRow label="Skipped tasks">
        <Toggle label="Skipped tasks" on={f.skipped} onChange={(skipped) => set({ skipped })} />
      </SettingRow>
      <h3 class="serif">Columns</h3>
      <div class="setting-row">
        <span class="avatar ufg-avatar" style={{ '--c': UFG_COLOR, width: '3.6rem', height: '3.6rem' }}>
          <House size="1.8rem" />
        </span>
        <span class="label">Up for Grabs</span>
        <Toggle label="Up for Grabs" on={f.upForGrabs} onChange={(upForGrabs) => set({ upForGrabs })} />
      </div>
      {profiles.value.map((p) => (
        <div class="setting-row">
          <Avatar profile={p} size={3.6} />
          <span class="label">{p.name}</span>
          <Toggle
            label={p.name}
            on={!f.hidden.includes(p.id)}
            onChange={(on) => set({ hidden: on ? f.hidden.filter((id) => id !== p.id) : [...f.hidden, p.id] })}
          />
        </div>
      ))}
    </div>
  );
}

function Body() {
  return (
    <div class="tk-tab">
      {mode.value === 'day' ? <DayView /> : <WeekView />}
      <TasksOverlays />
    </div>
  );
}

export const tasksTab: TabDef = {
  id: 'tasks',
  label: 'Tasks',
  icon: Check,
  Controls,
  Body,
  onAdd: () => editTask('new'),
  title: () =>
    mode.value === 'day'
      ? dayOffset.value
        ? formatHeaderDate(selectedDay.value)
        : null
      : weekOffset.value
        ? weekTitle(weekStart.value)
        : null,
};
