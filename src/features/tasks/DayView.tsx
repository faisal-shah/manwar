import { Check, House } from 'lucide-preact';
import { profiles, settings } from '../../data/store';
import { today } from '../../lib/clock';
import { progress } from '../../tasks/engine';
import { occurrencesFor, todayOccurrences } from '../../tasks/state';
import { Empty } from '../../ui/controls';
import { Avatar } from '../../ui/profile';
import { StarPill } from '../rewards/StarPill';
import { SECTION_META, buildColumns, defaultExpanded, isAllDone, sectionProgress, sectionsOf, type Column as Col } from './logic';
import { TaskCard, UFG_COLOR } from './TaskCard';
import { currentPart, sectionToggles, selectedDay, taskFilter, toggleSection } from './view';

/** Day view: one column per visible profile, Up for Grabs first when it has chores. */
export function DayView() {
  const day = selectedDay.value;
  const occ = day === today.value ? todayOccurrences.value : occurrencesFor(day);
  const cols = buildColumns(occ, profiles.value, taskFilter.value);
  if (!cols.length) return <NoColumns />;
  return (
    <div class="pcols" data-count={cols.length}>
      {cols.map((c) => (
        <DayColumn key={c.id} col={c} day={day} />
      ))}
    </div>
  );
}

/** No column to show: a new household with no profiles yet, or every column filtered out. */
export function NoColumns() {
  return profiles.value.length ? (
    <Empty emoji="👀">Every profile is hidden. Use Filter to show them.</Empty>
  ) : (
    <Empty emoji="👪">Add your family in Settings, under Profiles. Each person gets a column here.</Empty>
  );
}

export function ProgressPill({ done, total }: { done: number; total: number }) {
  return (
    <span
      class="pill progress-pill"
      style={{ '--p': `${total ? (done / total) * 100 : 0}%` }}
      aria-label={`${done} of ${total} done`}
    >
      <Check size="1.6rem" strokeWidth={2.6} />
      {done}/{total}
    </span>
  );
}

/** Avatar, serif name, done/total and (for a profile) the star balance. */
export function ColumnHead({ col }: { col: Pick<Col, 'id' | 'profile' | 'all'> }) {
  const p = col.profile;
  const prog = progress(col.all);
  return (
    <header class="pcol-head">
      {p ? (
        <Avatar profile={p} size={5.6} />
      ) : (
        <span class="avatar ufg-avatar" style={{ '--c': UFG_COLOR, width: '5.6rem', height: '5.6rem' }}>
          <House size="2.8rem" strokeWidth={2} />
        </span>
      )}
      <div class="pcol-id">
        <span class="pcol-name serif">{p ? p.name : 'Up for Grabs'}</span>
        <div class="pcol-pills">
          <ProgressPill {...prog} />
          {p && <StarPill profileId={p.id} value={p.stars} />}
        </div>
      </div>
    </header>
  );
}

function DayColumn({ col, day }: { col: Col; day: string }) {
  const isToday = day === today.value;
  const sections = sectionsOf(col.all);
  const allDone = isAllDone(col.all);
  const defaults = defaultExpanded(sections, {
    showAll: settings.value.tasksShowAllParts,
    isToday,
    part: currentPart.value,
    allDone,
  });
  const toggles = sectionToggles.value[`${day}:${col.id}`] ?? {};
  const isOpen = (s: (typeof sections)[number]) => toggles[s] ?? defaults.has(s);
  const color = col.profile?.color ?? UFG_COLOR;
  const onlyChores = sections.length === 1 && sections[0] === 'chores';
  return (
    <section class="pcol" style={{ '--c': color }} aria-label={col.profile?.name ?? 'Up for Grabs'} data-column={col.id}>
      <ColumnHead col={col} />
      {sections.length > 0 && !onlyChores && (
        <div class="tk-secs" role="group" aria-label="Sections">
          {sections.map((s) => {
            const sp = sectionProgress(col.all, s);
            const open = isOpen(s);
            const finished = sp.total > 0 && sp.done === sp.total;
            return (
              <button
                type="button"
                class={`tk-sec${open ? ' on' : ''}${finished ? ' finished' : ''}`}
                aria-pressed={open}
                data-section={`${col.id}:${s}`}
                style={{ '--p': `${sp.total ? (sp.done / sp.total) * 100 : 0}%` }}
                onClick={() => toggleSection(day, col.id, s, open)}
              >
                <span class="tk-sec-ring">
                  <span class="tk-sec-disc">{finished ? <Check size="2.6rem" strokeWidth={2.6} /> : SECTION_META[s].emoji}</span>
                </span>
                <span class="tk-sec-label">{SECTION_META[s].label}</span>
              </button>
            );
          })}
        </div>
      )}
      <div class="pcol-body scroll">
        {allDone && (
          <div class="tk-alldone">
            <span aria-hidden="true">🎉</span>
            All done!
          </div>
        )}
        {col.all.length === 0 && <Empty emoji="🙌">{isToday ? 'Nothing to do today.' : 'Nothing to do this day.'}</Empty>}
        {sections.filter(isOpen).map((s) => {
          const items = col.occ.filter((o) => o.section === s);
          if (!items.length) return null;
          return (
            <div class="tk-section" key={s}>
              {!onlyChores && <h3 class="tk-section-title serif">{SECTION_META[s].label}</h3>}
              <div class="tk-cards">
                {items.map((o) => (
                  <TaskCard key={o.id} o={o} day={day} color={color} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
