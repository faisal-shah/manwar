import { signal } from '@preact/signals';
import type { ComponentChildren, ComponentType } from 'preact';
import { useState } from 'preact/hooks';
import { CalendarDays, Check, LayoutGrid, List, House } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { goTo } from '../../app/nav';
import { asParent } from '../../core/lock';
import { saveSettings, settings } from '../../data/store';
import type { CalendarView, HomePane, TabId } from '../../data/types';
import { choose } from '../../ui/overlays';
import { CalendarPane } from '../calendar/CalendarPane';
import { calendarTab } from '../calendar';
import { ListsPane } from '../lists/ListsPane';
import { tasksTab } from '../tasks';
import { TodayTasksPane } from '../tasks/TodayPane';
import { MessageButton, openComposer } from '../messages';
import { TimerButton } from '../timer';
import './home.css';

/** Home's calendar view, separate from the Calendar tab's (kept in memory). */
export const homeCalendarView = signal<CalendarView>('week');

type IconType = ComponentType<{ size?: number | string; strokeWidth?: number }>;

function Pane({
  title,
  icon: Icon,
  kind,
  bare,
  children,
}: {
  title: string;
  icon: IconType;
  kind: string;
  /** The child draws its own header row (the calendar pane puts its controls beside the title). */
  bare?: boolean;
  children: ComponentChildren;
}) {
  return (
    <section class={`home-pane home-${kind}`} aria-label={title}>
      {!bare && (
        <header class="home-pane-head">
          <Icon size="1.8rem" strokeWidth={2} />
          <h2>{title}</h2>
        </header>
      )}
      <div class="home-pane-body">{children}</div>
    </section>
  );
}

function HomeBody() {
  const hidden = settings.value.homeHiddenPanes;
  const tasks = !hidden.includes('tasks');
  const lists = !hidden.includes('lists');
  return (
    <div class={`home${tasks || lists ? '' : ' home-solo'}`}>
      <Pane title="Calendar" icon={CalendarDays} kind="calendar" bare>
        <CalendarPane view={homeCalendarView.value} onViewChange={(v) => (homeCalendarView.value = v)} />
      </Pane>
      {(tasks || lists) && (
        <div class="home-side">
          {tasks && (
            <Pane title="Today's tasks" icon={Check} kind="tasks">
              <TodayTasksPane />
            </Pane>
          )}
          {lists && (
            <Pane title="Lists" icon={List} kind="lists">
              <ListsPane />
            </Pane>
          )}
        </div>
      )}
    </div>
  );
}

const PANES: { id: HomePane; label: string; icon: IconType }[] = [
  { id: 'tasks', label: 'Tasks', icon: Check },
  { id: 'lists', label: 'Lists', icon: List },
];

/** Customize: turn the Tasks and Lists panes on or off (the calendar pane always shows). */
function Customize() {
  const [open, setOpen] = useState(false);
  const hidden = settings.value.homeHiddenPanes;
  const toggle = (id: HomePane) =>
    asParent(() => {
      const now = settings.value.homeHiddenPanes;
      void saveSettings({ homeHiddenPanes: now.includes(id) ? now.filter((p) => p !== id) : [...now, id] });
    }, 'Enter the PIN to customize Home.');
  return (
    <div class="customize">
      <button type="button" class={`ctl home-ctl${open ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <LayoutGrid size="2.2rem" strokeWidth={2} />
        Customize
      </button>
      {open && (
        <>
          <div class="popover-scrim" onClick={() => setOpen(false)} />
          <div class="customize-menu" role="dialog" aria-label="Customize Home">
            {PANES.map((p) => {
              const on = !hidden.includes(p.id);
              return (
                <button type="button" role="switch" aria-checked={on} class="customize-row" onClick={() => toggle(p.id)}>
                  <p.icon size="2.4rem" strokeWidth={2} />
                  <span>{p.label}</span>
                  <span class={`toggle${on ? ' on' : ''}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function HomeControls() {
  return (
    <div class="ctl-group">
      <TimerButton />
      <MessageButton />
      <Customize />
    </div>
  );
}

/** The + on Home offers what the wall can add: an event or task (when those tabs are on) and a message. */
async function addFromHome(): Promise<void> {
  const shown = (id: TabId) => !settings.value.hiddenTabs.includes(id);
  const targets: { value: string; label: string; run: () => void }[] = [];
  if (calendarTab.onAdd && shown('calendar'))
    targets.push({ value: 'event', label: 'Event', run: () => (goTo('calendar'), calendarTab.onAdd!()) });
  if (tasksTab.onAdd && shown('tasks'))
    targets.push({ value: 'task', label: 'Task', run: () => (goTo('tasks'), tasksTab.onAdd!()) });
  targets.push({ value: 'message', label: 'Message', run: openComposer });
  if (targets.length === 1) return targets[0].run();
  const pick = await choose('Add to the wall', targets);
  targets.find((t) => t.value === pick)?.run();
}

export const homeTab: TabDef = {
  id: 'home',
  label: 'Home',
  icon: House,
  Controls: HomeControls,
  Body: HomeBody,
  onAdd: () => void addFromHome(),
};
