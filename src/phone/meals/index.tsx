import '../../features/meals/meals.css';
import './meals.css';
import { signal } from '@preact/signals';
import { ChevronLeft, ChevronRight, Plus, Repeat as RepeatIcon, ShoppingCart, Utensils } from 'lucide-preact';
import { asParent } from '../../core/lock';
import { data } from '../../data/store';
import type { ISODate, MealCategoryId, MealEntry } from '../../data/types';
import { openIngredients } from '../../features/meals/IngredientsModal';
import { MealPopover } from '../../features/meals/MealPopover';
import { PlanMealSheet } from '../../features/meals/PlanMealSheet';
import { formatWeekRange } from '../../features/meals/plan';
import { mealEmoji, planTarget, recipeOf, visibleCategories, weekOffset, weekStartDate } from '../../features/meals/state';
import { CategoryBadge } from '../../features/meals/ui';
import { today } from '../../lib/clock';
import { formatLongDate, fromISODate } from '../../lib/date';
import { Button, Empty, IconButton } from '../../ui/controls';
import { useOpeningTapGuard } from '../../ui/overlays';
import type { MoreItem } from '../more/items';
import { mealsOn, planCategory, weekByDay, type PlannedMeal } from './logic';

const popover = signal<{ entry: MealEntry; date: ISODate; anchor: DOMRect } | null>(null);

const openPlan = (date: ISODate, category: MealCategoryId) =>
  void asParent(() => (planTarget.value = { date, category }), 'Enter the PIN to plan meals.');

function MealButton({ meal, date, big }: { meal: PlannedMeal; date: ISODate; big?: boolean }) {
  const emoji = mealEmoji(meal.entry);
  return (
    <button
      type="button"
      class={`pm-meal${big ? ' big' : ''}`}
      style={{ '--c': meal.category.color }}
      onClick={(e) => (popover.value = { entry: meal.entry, date, anchor: e.currentTarget.getBoundingClientRect() })}
    >
      {big ? (
        <span class="pm-emoji" aria-hidden="true">
          {emoji ?? <Utensils size="2.6rem" />}
        </span>
      ) : (
        <CategoryBadge category={meal.category} size={3.2} />
      )}
      <span class="pm-meal-text">
        <bdi class="pm-title">
          {!big && emoji ? `${emoji} ` : ''}
          {meal.entry.title}
        </bdi>
        {!big && <small>{meal.category.name}</small>}
      </span>
      {meal.entry.repeat && <RepeatIcon class="pm-repeat" size="1.8rem" aria-label="Repeats" />}
    </button>
  );
}

/** Tonight's dinner, large, with its ingredients a tap away. */
function Tonight() {
  const cats = visibleCategories.value;
  const dinner = cats.find((c) => c.id === 'dinner');
  if (!dinner) return null;
  const day = today.value;
  const meals = mealsOn(data.meals.value, day, [dinner]);
  return (
    <section class="ph-card pm-tonight" style={{ '--c': dinner.color }}>
      <h2 class="ph-card-title">Tonight's dinner</h2>
      {meals.length ? (
        meals.map((m) => {
          const recipe = recipeOf(m.entry);
          return (
            <div class="pm-tonight-meal" key={m.entry.id}>
              <MealButton meal={m} date={day} big />
              {recipe && recipe.ingredients.length > 0 && (
                <button type="button" class="pill-btn" onClick={() => openIngredients(recipe)}>
                  <ShoppingCart size="2.2rem" /> Add ingredients
                </button>
              )}
            </div>
          );
        })
      ) : (
        <div class="pm-none">
          <p class="muted">Nothing planned for dinner.</p>
          <Button small onClick={() => openPlan(day, 'dinner')}>
            <Plus size="2rem" /> Plan dinner
          </Button>
        </div>
      )}
    </section>
  );
}

/** More > Meals: tonight's dinner and the week by day, with planning and ingredients. */
function MealsView() {
  const guard = useOpeningTapGuard();
  const cats = visibleCategories.value;
  const days = weekByDay(data.meals.value, weekStartDate.value, cats);
  const target = planTarget.value;
  const pop = popover.value;
  const thisYear = fromISODate(today.value).getFullYear();
  return (
    <div class="ph-stack" {...guard}>
      <Tonight />
      <div class="pm-weeknav">
        <IconButton label="Previous week" onClick={() => weekOffset.value--}>
          <ChevronLeft size="2.6rem" />
        </IconButton>
        <button
          type="button"
          class={`pm-week${weekOffset.value === 0 ? ' on' : ''}`}
          onClick={() => (weekOffset.value = 0)}
          aria-label={
            weekOffset.value === 0 ? 'This week' : `${formatWeekRange(weekStartDate.value, thisYear)}, back to this week`
          }
        >
          {weekOffset.value === 0 ? 'This week' : formatWeekRange(weekStartDate.value, thisYear)}
        </button>
        <IconButton label="Next week" onClick={() => weekOffset.value++}>
          <ChevronRight size="2.6rem" />
        </IconButton>
      </div>
      {cats.length ? (
        days.map((d) => {
          const isToday = d.date === today.value;
          const first = planCategory(d, cats);
          return (
            <section
              key={d.date}
              class={`ph-card pm-day${isToday ? ' today' : ''}${d.meals.length ? '' : ' empty'}`}
              aria-label={formatLongDate(d.date)}
            >
              <header class="pm-day-head">
                <h3>{formatLongDate(d.date)}</h3>
                {isToday && <span class="pm-today">Today</span>}
                {!d.meals.length && <span class="muted pm-empty">Nothing planned</span>}
                {first && (
                  <IconButton
                    label={`Plan a meal on ${formatLongDate(d.date)}`}
                    class="pm-add"
                    onClick={() => openPlan(d.date, first)}
                  >
                    <Plus size="2.4rem" />
                  </IconButton>
                )}
              </header>
              {d.meals.length > 0 && (
                <div class="pm-meals">
                  {d.meals.map((m) => (
                    <MealButton key={`${m.entry.id}|${d.date}`} meal={m} date={d.date} />
                  ))}
                </div>
              )}
            </section>
          );
        })
      ) : (
        <Empty emoji="🍽️">Every meal category is hidden. Show one on the wall, in Meals under Filter.</Empty>
      )}
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
    </div>
  );
}

export const mealsItem: MoreItem = {
  id: 'meals',
  label: 'Meals',
  icon: Utensils,
  hint: () => {
    const dinner = visibleCategories.value.find((c) => c.id === 'dinner');
    const tonight = dinner ? mealsOn(data.meals.value, today.value, [dinner]) : [];
    return tonight.length ? `Tonight: \u2068${tonight.map((m) => m.entry.title).join(', ')}\u2069` : null;
  },
  View: MealsView,
};
