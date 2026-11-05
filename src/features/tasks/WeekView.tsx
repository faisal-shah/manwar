import { Fragment } from 'preact';
import { Check, House, SkipForward, X } from 'lucide-preact';
import { data, profileById, profiles, settings } from '../../data/store';
import { UP_FOR_GRABS } from '../../data/types';
import { today } from '../../lib/clock';
import { dayShort, fromISODate } from '../../lib/date';
import { occurrencesFor, todayOccurrences } from '../../tasks/state';
import { Empty } from '../../ui/controls';
import { Avatar } from '../../ui/profile';
import { StarPill } from '../rewards/StarPill';
import { NoColumns } from './DayView';
import { detailsFor, tapCheck } from './actions';
import { SECTION_META, subtitle, weekRows, type WeekCell, type WeekRow } from './logic';
import { UFG_COLOR } from './TaskCard';
import { firstDay, taskFilter, weekDays, weekOwner } from './view';

/** Week view: one profile's habit grid (rows = tasks, columns = days), picked from the avatar row. */
export function WeekView() {
  const days = weekDays.value;
  const f = taskFilter.value;
  const t = today.value;
  const hasUfg = data.tasks.value.some((x) => !x.archived && x.kind === 'chore' && (x.upForGrabs || x.assignees.length === 0));
  const owners = [
    ...(hasUfg && f.upForGrabs ? [UP_FOR_GRABS] : []),
    ...profiles.value.filter((p) => !f.hidden.includes(p.id)).map((p) => p.id),
  ];
  if (!owners.length) return <NoColumns />;
  const owner =
    weekOwner.value && owners.includes(weekOwner.value)
      ? weekOwner.value
      : (owners.find((id) => id !== UP_FOR_GRABS) ?? owners[0]);
  const p = profileById.value.get(owner);
  const color = p?.color ?? UFG_COLOR;
  // Days before the task history stay blank: their states are not loaded.
  const first = firstDay.value;
  const byDay = days.map((d) => (d < first ? [] : d === t ? todayOccurrences.value : occurrencesFor(d)));
  const tasks = new Map(data.tasks.value.map((x) => [x.id, x]));
  const states = data.taskStates.value.filter((s) => s.date >= first);
  const rows = weekRows(days, byDay, owner, t, states, tasks);

  return (
    <div class="wk" style={{ '--c': color }}>
      <div class="wk-top">
        <div class="wk-owners" role="tablist" aria-label="Whose week">
          {owners.map((id) => {
            const op = profileById.value.get(id);
            const on = id === owner;
            return (
              <button type="button" role="tab" aria-selected={on} class={on ? 'on' : ''} onClick={() => (weekOwner.value = id)}>
                {op ? (
                  <Avatar profile={op} size={5.6} ring={on} />
                ) : (
                  <span
                    class={`avatar ufg-avatar${on ? ' ring' : ''}`}
                    style={{ '--c': UFG_COLOR, width: '5.6rem', height: '5.6rem' }}
                  >
                    <House size="2.6rem" />
                  </span>
                )}
                <span class="wk-owner-name">{op?.name ?? 'Up for Grabs'}</span>
              </button>
            );
          })}
        </div>
        {p && <StarPill profileId={p.id} value={p.stars} large />}
      </div>
      <div class="wk-grid pcol">
        <div class="wk-row wk-head">
          <span class="wk-corner serif">{p ? `${p.name}'s week` : 'Up for Grabs'}</span>
          {days.map((d) => {
            const dt = fromISODate(d);
            return (
              <span class={`wk-day${d === t ? ' today' : ''}`}>
                {dayShort(dt.getDay())} <span class="wk-num">{dt.getDate()}</span>
              </span>
            );
          })}
        </div>
        <div class="wk-body scroll">
          {rows.length === 0 && <Empty emoji="🗓️">Nothing scheduled this week.</Empty>}
          {rows.map((row, i) => (
            <Fragment key={row.key}>
              {(i === 0 || rows[i - 1].section !== row.section) && (
                <h3 class="wk-section serif">
                  {SECTION_META[row.section].emoji} {SECTION_META[row.section].label}
                </h3>
              )}
              <Row row={row} days={days} color={color} />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ row, days, color }: { row: WeekRow; days: string[]; color: string }) {
  const sub = subtitle(row.task, settings.value.timeFormat);
  return (
    <div class="wk-row wk-task" data-task={row.task.title}>
      <span class="wk-label">
        <span class="wk-emoji" aria-hidden="true">
          {row.task.emoji ?? '•'}
        </span>
        <span class="wk-title">
          {row.task.title}
          {sub && <small>{sub}</small>}
        </span>
      </span>
      {row.cells.map((c, i) => (c ? <Cell c={c} day={days[i]} color={color} /> : <span class="wk-cell" />))}
    </div>
  );
}

function Cell({ c, day, color }: { c: WeekCell; day: string; color: string }) {
  const by = c.status === 'done' && c.o.profileId === UP_FOR_GRABS ? profileById.value.get(c.o.state!.by) : undefined;
  const label = `${c.o.task.title}, ${day}: ${c.status}`;
  const tappable = c.status !== 'upcoming';
  return (
    <span class="wk-cell">
      <button
        type="button"
        class={`wk-dot ${c.status}${c.late ? ' late' : ''}`}
        style={{ '--c': by?.color ?? color }}
        aria-label={label}
        disabled={!tappable}
        onClick={(e) => {
          const el = e.currentTarget as HTMLElement;
          // A late chore still open is today's to check off, wherever its due date sits.
          const on = c.late ? today.value : day;
          if (c.status === 'skipped') detailsFor.value = { o: c.o, day: on, anchor: el.getBoundingClientRect() };
          else tapCheck(c.o, on, el.getBoundingClientRect());
        }}
      >
        {c.status === 'done' &&
          (by ? <span class="wk-by">{by.emoji || by.name.charAt(0)}</span> : <Check size="2.2rem" strokeWidth={3} />)}
        {c.status === 'skipped' && <SkipForward size="1.8rem" />}
        {c.status === 'missed' && <X size="1.6rem" strokeWidth={2} />}
      </button>
    </span>
  );
}
