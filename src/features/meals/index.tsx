import './meals.css';
import { signal } from '@preact/signals';
import { Fragment } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { ChevronLeft, ChevronRight, EyeOff, Plus, Repeat as RepeatIcon, Utensils } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { asParent } from '../../core/lock';
import { data } from '../../data/store';
import type { ISODate, MealCategoryId, MealEntry } from '../../data/types';
import { today } from '../../lib/clock';
import { dayShort, formatLongDate, fromISODate } from '../../lib/date';
import { Empty } from '../../ui/controls';
import { Popover } from '../../ui/overlays';
import { MealCategoriesEditor } from './MealCategoriesEditor';
import { MealPopover } from './MealPopover';
import { PlanMealSheet } from './PlanMealSheet';
import { byCell, cellKey, formatWeekRange, mealOccurrences, weekDays } from './plan';
import { mealEmoji, planTarget, visibleCategories, weekOffset, weekStartDate } from './state';
import { CategoryBadge } from './ui';

const popover = signal<{ entry: MealEntry; date: ISODate; anchor: DOMRect } | null>(null);

const openPlan = (date: ISODate, category: MealCategoryId) =>
  void asParent(() => (planTarget.value = { date, category }), 'Enter the PIN to plan meals.');

const SWIPE_PX = 110;

/** Shorter titles as a cell fills up: two lines each for two meals, one line from three. */
const density = (n: number) => (n > 2 ? ' crowded' : n === 2 ? ' pair' : '');

/** Seven day columns by the visible meal categories; swipe sideways to change week. */
function MealsBody() {
  const days = weekDays(weekStartDate.value);
  const cats = visibleCategories.value;
  const cells = byCell(mealOccurrences(data.meals.value, days[0], days[6]));
  const target = planTarget.value;
  const pop = popover.value;
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);

  const onPointerDown = (e: PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    swiped.current = false;
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) {
      swiped.current = true;
      weekOffset.value += dx < 0 ? 1 : -1;
    }
  };

  return (
    <>
      <div
        class={`meals-grid${target ? ' squeeze' : ''}`}
        style={{ gridTemplateRows: `auto repeat(${cats.length}, minmax(0, 1fr))` }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        <div />
        {days.map((d) => {
          const isToday = d === today.value;
          return (
            <div class={`mg-day${isToday ? ' today' : ''}`} key={d}>
              <span>{dayShort(fromISODate(d).getDay())}</span>
              <span class="num">{fromISODate(d).getDate()}</span>
            </div>
          );
        })}
        {cats.map((c) => (
          <Fragment key={c.id}>
            <div class="mg-cat" style={{ '--c': c.color }}>
              <CategoryBadge category={c} size={3} />
              <span class="mg-cat-name">{c.name}</span>
            </div>
            {days.map((d) => {
              const entries = cells.get(cellKey(d, c.id)) ?? [];
              const selected = target && !target.entry && target.date === d && target.category === c.id;
              const label = `${c.name} on ${formatLongDate(d)}`;
              return (
                <div
                  key={`${d}|${c.id}`}
                  class={`mg-cell${entries.length ? ' planned' : ''}${density(entries.length)}${selected ? ' selected' : ''}`}
                  style={{ '--c': c.color }}
                  data-cell={`${d}|${c.id}`}
                  role={entries.length ? undefined : 'button'}
                  aria-label={entries.length ? undefined : `Plan ${label}`}
                  tabIndex={entries.length ? undefined : 0}
                  onClick={() => openPlan(d, c.id)}
                >
                  {entries.length > 0 && (
                    <div class="mg-list">
                      {entries.map((e) => {
                        const emoji = mealEmoji(e);
                        return (
                          <button
                            type="button"
                            class="mg-entry"
                            key={e.id}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              popover.value = { entry: e, date: d, anchor: ev.currentTarget.getBoundingClientRect() };
                            }}
                          >
                            {emoji && <span class="mg-emoji">{emoji}</span>}
                            <bdi class="mg-title">{e.title}</bdi>
                            {e.repeat && <RepeatIcon class="mg-repeat" size="1.8rem" aria-label="Repeats" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {entries.length > 0 && (
                    <button
                      type="button"
                      class="mg-add"
                      aria-label={`Add another ${label}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openPlan(d, c.id);
                      }}
                    >
                      <Plus size="2.2rem" />
                    </button>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      {!cats.length && <Empty emoji="🍽️">Every meal category is hidden. Turn one on in Filter.</Empty>}
      {target && (
        <PlanMealSheet
          key={`${target.date}|${target.category}|${target.entry?.id ?? ''}`}
          date={target.date}
          category={target.category}
          entry={target.entry}
          onClose={() => (planTarget.value = null)}
        />
      )}
      {pop && <MealPopover entry={pop.entry} date={pop.date} anchor={pop.anchor} onClose={() => (popover.value = null)} />}
    </>
  );
}

function MealsControls() {
  const [filter, setFilter] = useState<DOMRect | null>(null);
  return (
    <div class="ctl-group">
      <button
        type="button"
        class={`ctl${filter ? ' on' : ''}`}
        onClick={(e) => setFilter(e.currentTarget.getBoundingClientRect())}
      >
        <EyeOff size="2rem" /> Filter
      </button>
      <button type="button" class="ctl ctl-round" aria-label="Previous week" onClick={() => weekOffset.value--}>
        <ChevronLeft size="2.4rem" />
      </button>
      <button type="button" class={`ctl${weekOffset.value === 0 ? ' on' : ''}`} onClick={() => (weekOffset.value = 0)}>
        This week
      </button>
      <button type="button" class="ctl ctl-round" aria-label="Next week" onClick={() => weekOffset.value++}>
        <ChevronRight size="2.4rem" />
      </button>
      {filter && (
        <Popover anchor={filter} width={52} onClose={() => setFilter(null)}>
          <MealCategoriesEditor />
        </Popover>
      )}
    </div>
  );
}

/** No + button: as on Skylight's Meals tab, tapping a cell is how a meal is planned. */
export const mealsTab: TabDef = {
  id: 'meals',
  label: 'Meals',
  icon: Utensils,
  Controls: MealsControls,
  Body: MealsBody,
  title: () => (weekOffset.value === 0 ? null : formatWeekRange(weekStartDate.value, fromISODate(today.value).getFullYear())),
};
