import { CalendarDays, ChevronRight, House, ListChecks, MessageSquareText, Plus, Timer, UtensilsCrossed } from 'lucide-preact';
import { countdownsFor, eventsOn } from '../../calendar/engine';
import type { CalEvent } from '../../calendar/types';
import { data, profiles } from '../../data/store';
import { UP_FOR_GRABS } from '../../data/types';
import { nowMs, today } from '../../lib/clock';
import { addDays, formatLongDate } from '../../lib/date';
import { plural } from '../../lib/text';
import { daysText } from '../../features/calendar/layout';
import { countdownEmoji, fillStyle, nowMinute, timeLabel, whoOf } from '../../features/calendar/model';
import { Avatars } from '../../features/calendar/parts';
import { openDetail } from '../../features/calendar/state';
import { openIngredients } from '../../features/meals/IngredientsModal';
import { mealOccurrences } from '../../features/meals/plan';
import { categoryById, recipeOf, mealEmoji } from '../../features/meals/state';
import { pending } from '../../features/messages/state';
import { timeAgo } from '../../features/messages/logic';
import { splitRemaining } from '../../features/timer/logic';
import { timer, timerPhase } from '../../features/timer/state';
import { editTask } from '../../features/tasks/actions';
import { UFG_COLOR } from '../../features/tasks/TaskCard';
import { progress } from '../../tasks/engine';
import { todayOccurrences, todayProgress } from '../../tasks/state';
import { Button } from '../../ui/controls';
import { swallowRestOfTap } from '../../ui/overlays';
import { Avatar } from '../../ui/profile';
import { hiddenPeople, notLoaded } from '../calendar/state';
import { openPlan } from '../meals';
import { moreView } from '../more';
import { goPhone, type PhonePage } from '../nav';
import { showTasksOf } from '../tasks/state';
import { capped, isNow, nextUp, type DayAgenda } from './logic';
import '../../features/calendar/calendar.css';
import './today.css';

/** The phone's first screen: what is on the wall and next on the calendar, how each person's day goes, dinner, countdowns. */
function TodayBody() {
  return (
    <div class="ph-stack pd">
      <p class="pd-date">{formatLongDate(today.value)}</p>
      <OnTheWall />
      <NextUpCard />
      <ProgressCard />
      <DinnerCard />
      <CountdownsCard />
    </div>
  );
}

/** The wall's running timer and the note it shows, when there are any. */
function OnTheWall() {
  const t = timer.value;
  const phase = timerPhase.value;
  const note = pending.value[0];
  if (!t && !note) return null;
  const from = note?.from ? data.profiles.value.find((p) => p.id === note.from) : undefined;
  return (
    <section class="ph-card pd-wall" aria-label="On the wall">
      {t && phase && (
        <div class={`pd-line${phase === 'done' ? ' ringing' : ''}`} role="timer">
          <Timer size="2.2rem" />
          <span class="pd-line-text">{timerText(t.startAt, t.endAt, phase)}</span>
        </div>
      )}
      {note && (
        <div class="pd-line">
          <MessageSquareText size="2.2rem" />
          <span class="pd-line-text">
            <span class="pd-note" dir="auto">
              {note.text}
            </span>
            <small>
              On the wall
              {from ? (
                <>
                  , from <bdi>{from.name}</bdi>
                </>
              ) : null}
              , {timeAgo(note.createdAt, nowMinute.value)}
            </small>
          </span>
        </div>
      )}
    </section>
  );
}

function timerText(startAt: number, endAt: number, phase: 'lead' | 'running' | 'done'): string {
  if (phase === 'done') return "The wall timer is done. Time's up!";
  const { mins, secs } = splitRemaining(endAt - Math.max(nowMs.value, startAt));
  return `Wall timer: ${mins}:${String(secs).padStart(2, '0')} left`;
}

const MAX_EVENTS = 4;

/** Today's and tomorrow's events under the phone's people filter, the same the Calendar tab shows. */
function NextUpCard() {
  const day = today.value;
  const now = nowMinute.value;
  const hidden = hiddenPeople.value;
  const next = nextUp(eventsOn(day, hidden), eventsOn(addDays(day, 1), hidden), now);
  const notYet = notLoaded.value;
  const empty =
    !next.today.allDay.length && !next.today.timed.length && !next.tomorrow?.allDay.length && !next.tomorrow?.timed.length;
  return (
    <section class="ph-card" aria-label="Calendar">
      <CardHead icon={CalendarDays} title="Next up" onMore={openCalendar} more="See all" />
      {notYet ? (
        <p class="muted pd-empty" role="status">
          {notYet}
        </p>
      ) : empty ? (
        <p class="muted pd-empty">Nothing else on the calendar today or tomorrow.</p>
      ) : (
        <>
          <Agenda label="Today" agenda={next.today} now={now} />
          {next.tomorrow && <Agenda label="Tomorrow" agenda={next.tomorrow} now={now} />}
        </>
      )}
    </section>
  );
}

function Agenda({ label, agenda, now }: { label: string; agenda: DayAgenda; now: number }) {
  const all = [...agenda.allDay, ...agenda.timed];
  if (!all.length) return label === 'Today' ? <p class="muted pd-empty">Nothing else today.</p> : null;
  const { shown, more } = capped(all, MAX_EVENTS);
  return (
    <div class="pd-day">
      <h3 class="pd-day-label">{label}</h3>
      <ul class="pd-events">
        {shown.map((ev) => (
          <EventRow key={ev.key} ev={ev} now={now} />
        ))}
      </ul>
      {more > 0 && (
        <button type="button" class="pd-more" onClick={openCalendar}>
          {plural(more, 'later event')}
        </button>
      )}
    </div>
  );
}

function EventRow({ ev, now }: { ev: CalEvent; now: number }) {
  const who = whoOf(ev);
  return (
    <li>
      <button type="button" class="pd-ev" style={fillStyle(ev, 'light')} onClick={(e) => openEvent(ev, e.currentTarget)}>
        <span class="pd-ev-text">
          <span class="pd-ev-time">
            {isNow(ev, now) && <span class="pd-now">Now</span>}
            {timeLabel(ev)}
          </span>
          <span class="pd-ev-title" dir="auto">
            {ev.title}
          </span>
        </span>
        {who.length > 0 && <Avatars who={who} size={2.8} />}
      </button>
    </li>
  );
}

function CardHead({
  icon: Icon,
  title,
  onMore,
  more,
}: {
  icon: typeof CalendarDays;
  title: string;
  onMore?: () => void;
  more?: string;
}) {
  return (
    <header class="pd-head">
      <Icon size="2rem" />
      <h2 class="ph-card-title">{title}</h2>
      {onMore && (
        <button type="button" class="pd-head-link" onClick={onMore}>
          {more}
          <ChevronRight size="1.8rem" />
        </button>
      )}
    </header>
  );
}

/** Each person's progress today, and the Up for Grabs chores still open; a tap opens their tasks. */
function ProgressCard() {
  const people = profiles.value;
  const prog = todayProgress.value;
  const ufg = progress(todayOccurrences.value.filter((o) => o.profileId === UP_FOR_GRABS));
  const noTasks = !data.tasks.value.some((t) => !t.archived);
  return (
    <section class="ph-card" aria-label="Tasks today">
      <CardHead icon={ListChecks} title="Tasks today" />
      {!people.length ? (
        <p class="muted pd-empty">No people yet. People are added at the wall, in Settings, under Profiles.</p>
      ) : (
        <>
          {noTasks && (
            <p class="muted pd-empty">
              No tasks yet.{' '}
              <button type="button" class="ph-inline-link" onClick={addFirstTask}>
                Add a routine or chore
              </button>
            </p>
          )}
          <ul class="pd-people">
            {ufg.total > 0 && (
              <li>
                <button type="button" class="pd-person" style={{ '--c': UFG_COLOR }} onClick={() => showTasksOf(UP_FOR_GRABS)}>
                  <span class="avatar ufg-avatar" style={{ '--c': UFG_COLOR, width: '4rem', height: '4rem' }}>
                    <House size="2rem" strokeWidth={2} />
                  </span>
                  <Bar name="Up for Grabs" done={ufg.done} total={ufg.total} />
                </button>
              </li>
            )}
            {people.map((p) => {
              const pr = prog.get(p.id) ?? { done: 0, total: 0 };
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    class="pd-person"
                    style={{ '--c': p.color }}
                    data-person={p.id}
                    aria-label={`${p.name}: ${pr.done} of ${pr.total} done`}
                    onClick={() => showTasksOf(p.id)}
                  >
                    <Avatar profile={p} size={4} />
                    <Bar name={p.name} done={pr.done} total={pr.total} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** A name over its progress bar, with done/total at the right. */
function Bar({ name, done, total }: { name: string; done: number; total: number }) {
  const all = total > 0 && done >= total;
  return (
    <span class="pd-person-main">
      <span class="pd-person-top">
        <span class="pd-person-name" dir="auto">
          {name}
        </span>
        <span class="pd-count">{total === 0 ? 'None today' : all ? 'All done' : `${done}/${total}`}</span>
      </span>
      <span class="pd-bar" style={{ '--p': `${total ? (done / total) * 100 : 0}%` }} aria-hidden="true" />
    </span>
  );
}

/** Tonight's dinner from the meal plan; a recipe's ingredients go to the grocery list from here. */
function DinnerCard() {
  const cat = categoryById.value.get('dinner');
  if (!cat?.visible) return null;
  const day = today.value;
  const meals = mealOccurrences(data.meals.value, day, day)
    .filter((o) => o.entry.category === 'dinner')
    .map((o) => o.entry);
  return (
    <section class="ph-card" aria-label={cat.name}>
      <CardHead icon={UtensilsCrossed} title={`${cat.name} tonight`} />
      {meals.length === 0 ? (
        <div class="ph-none">
          <p class="muted">Nothing planned.</p>
          <Button small onClick={planDinner}>
            <Plus size="2rem" /> Plan dinner
          </Button>
        </div>
      ) : (
        <ul class="pd-meals">
          {meals.map((m) => {
            const recipe = recipeOf(m);
            const emoji = mealEmoji(m);
            return (
              <li key={m.id} class="pd-meal" style={{ '--c': cat.color }}>
                <span class="pd-meal-emoji" aria-hidden="true">
                  {emoji ?? '🍽️'}
                </span>
                <span class="pd-meal-title">
                  <bdi>{m.title}</bdi>
                </span>
                {recipe && recipe.ingredients.length > 0 && (
                  <button type="button" class="btn btn-sm" onClick={() => openIngredients(recipe)}>
                    Ingredients
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The countdowns in the household's window, soonest first, under the phone's people filter. */
function CountdownsCard() {
  const list = countdownsFor(hiddenPeople.value);
  if (!list.length) return null;
  return (
    <section class="ph-card" aria-label="Countdowns">
      <CardHead icon={Timer} title="Countdowns" />
      <ul class="pd-cds">
        {list.map(({ ev, days }) => {
          const emoji = countdownEmoji(ev);
          return (
            <li key={ev.key} class="pd-cd" style={fillStyle(ev, 'light')}>
              <span class="pd-cd-emoji" aria-hidden="true">
                {emoji ?? <Timer size="2.2rem" />}
              </span>
              <span class="pd-cd-title" dir="auto">
                {ev.title}
              </span>
              <span class="pd-cd-days">{daysText(days)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The calendar opens under the finger: the rest of a double tap presses nothing there. */
function openCalendar(): void {
  swallowRestOfTap();
  goPhone('calendar');
}

/**
 * An event's details, on the Calendar tab (its sheets live there). Back
 * closes them, then leaves the tab for Today, as for an event tapped on the
 * Calendar tab itself.
 */
function openEvent(ev: CalEvent, el: Element): void {
  swallowRestOfTap();
  goPhone('calendar');
  openDetail(ev, el);
}

/** More > Meals with the plan sheet open on tonight's dinner. */
function planDinner(): void {
  swallowRestOfTap();
  goPhone('more');
  moreView.value = 'meals';
  openPlan(today.peek(), 'dinner');
}

/** The first task: the Tasks tab with its editor open. */
function addFirstTask(): void {
  swallowRestOfTap();
  goPhone('tasks');
  editTask('new');
}

export const todayPage: PhonePage = {
  id: 'today',
  label: 'Today',
  icon: House,
  Body: TodayBody,
};
