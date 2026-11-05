import { House, ListChecks, Plus } from 'lucide-preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { profileById, profiles } from '../../data/store';
import { UP_FOR_GRABS, type Profile } from '../../data/types';
import { today } from '../../lib/clock';
import { forProfile, progress, type Occurrence } from '../../tasks/engine';
import { todayOccurrences } from '../../tasks/state';
import { claimRequest, detailsFor, editTask } from '../../features/tasks/actions';
import { ColumnHead, nothingToDo } from '../../features/tasks/DayView';
import { ClaimHost, DetailsHost } from '../../features/tasks/Details';
import { CelebrationHost } from '../../features/tasks/effects';
import { EditorHost } from '../../features/tasks/Editor';
import { SECTION_META, isAllDone, sectionProgress, sectionsOf } from '../../features/tasks/logic';
import { TaskCard, UFG_COLOR } from '../../features/tasks/TaskCard';
import { Empty, IconButton } from '../../ui/controls';
import { Avatar } from '../../ui/profile';
import type { PhonePage } from '../nav';
import { StarsHost } from '../stars/PersonStars';
import { shownPerson } from './logic';
import { tasksFor } from './state';
import '../../features/tasks/columns.css';
import '../../features/tasks/tasks.css';
import './tasks.css';

/**
 * The phone's Tasks tab: one person's tasks for today (or the Up for Grabs
 * chores), grouped as the wall groups them. Checking off, unchecking,
 * skipping, the claim dialog, details, the editor and the celebrations are
 * the wall's own (features/tasks).
 */
function TasksBody() {
  const day = today.value;
  // This tab shows today alone: at midnight, details or a claim still open are about a list that is gone.
  useEffect(() => {
    if (detailsFor.peek() && detailsFor.peek()!.day !== day) detailsFor.value = null;
    if (claimRequest.peek() && claimRequest.peek()!.day !== day) claimRequest.value = null;
  }, [day]);
  const occ = todayOccurrences.value;
  const people = profiles.value;
  const ufg = occ.filter((o) => o.profileId === UP_FOR_GRABS);
  const who = shownPerson(
    tasksFor.value,
    people.map((p) => p.id),
    ufg.length > 0,
  );
  return (
    <div class="pt">
      {who === null ? (
        <Empty emoji="👪">
          No people yet. People are added at the wall, in Settings, under Profiles. Then their tasks show here.
        </Empty>
      ) : (
        <>
          <PersonChips people={people} who={who} occ={occ} ufg={ufg} />
          {who === UP_FOR_GRABS ? (
            <UpForGrabs occ={ufg} />
          ) : (
            <PersonTasks key={who} profile={profileById.value.get(who)!} occ={forProfile(occ, who)} />
          )}
        </>
      )}
      <DetailsHost />
      <ClaimHost />
      <EditorHost />
      <StarsHost />
      <CelebrationHost />
    </div>
  );
}

/** Avatar chips to pick whose tasks show, Up for Grabs first when it has chores; the picked one scrolls into view. */
function PersonChips({ people, who, occ, ufg }: { people: Profile[]; who: string; occ: Occurrence[]; ufg: Occurrence[] }) {
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [who]);
  const pick = (id: string) => (tasksFor.value = id);
  const u = progress(ufg);
  return (
    <div class="pt-chips" ref={row} role="group" aria-label="Whose tasks">
      {ufg.length > 0 && (
        <button
          type="button"
          class={`pt-chip${who === UP_FOR_GRABS ? ' on' : ''}`}
          style={{ '--c': UFG_COLOR }}
          aria-pressed={who === UP_FOR_GRABS}
          data-person={UP_FOR_GRABS}
          onClick={() => pick(UP_FOR_GRABS)}
        >
          <span class="avatar ufg-avatar" style={{ '--c': UFG_COLOR, width: '3.6rem', height: '3.6rem' }}>
            <House size="1.8rem" strokeWidth={2} />
          </span>
          <span class="pt-chip-text">
            <span class="pt-chip-name">Up for Grabs</span>
            <span class="pt-chip-count">
              {u.done}/{u.total}
            </span>
          </span>
        </button>
      )}
      {people.map((p) => {
        const pr = progress(forProfile(occ, p.id));
        return (
          <button
            type="button"
            key={p.id}
            class={`pt-chip${who === p.id ? ' on' : ''}`}
            style={{ '--c': p.color }}
            aria-pressed={who === p.id}
            data-person={p.id}
            onClick={() => pick(p.id)}
          >
            <Avatar profile={p} size={3.6} />
            <span class="pt-chip-text">
              <span class="pt-chip-name" dir="auto">
                {p.name}
              </span>
              <span class="pt-chip-count">{pr.total ? `${pr.done}/${pr.total}` : '-'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One person's day: their head (progress, stars), then each section with its tasks. */
function PersonTasks({ profile, occ }: { profile: Profile; occ: Occurrence[] }) {
  const day = today.value;
  const sections = sectionsOf(occ);
  const onlyChores = sections.length === 1 && sections[0] === 'chores';
  return (
    <section class="pt-list" style={{ '--c': profile.color }} aria-label={profile.name} data-column={profile.id}>
      <ColumnHead col={{ id: profile.id, profile, all: occ }} />
      {isAllDone(occ) && (
        <div class="pt-alldone">
          <span aria-hidden="true">🎉</span> All done for today!
        </div>
      )}
      {occ.length === 0 && <Empty emoji="🙌">{nothingToDo(true)}</Empty>}
      {sections.map((s) => {
        const sp = sectionProgress(occ, s);
        return (
          <div class="pt-section" key={s}>
            {!onlyChores && (
              <h3 class="pt-section-title" data-section={`${profile.id}:${s}`}>
                <span aria-hidden="true">{SECTION_META[s].emoji}</span>
                <span class="serif">{SECTION_META[s].label}</span>
                <span class="pt-section-count">
                  {sp.done}/{sp.total}
                </span>
              </h3>
            )}
            <div class="tk-cards">
              {occ
                .filter((o) => o.section === s)
                .map((o) => (
                  <TaskCard key={o.id} o={o} day={day} color={profile.color} compact />
                ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Up for Grabs: the open chores (a check asks who did it), then the ones done today and who did them. */
function UpForGrabs({ occ }: { occ: Occurrence[] }) {
  const day = today.value;
  const open = occ.filter((o) => o.state?.status !== 'done');
  const done = occ.filter((o) => o.state?.status === 'done');
  return (
    <section class="pt-list" style={{ '--c': UFG_COLOR }} aria-label="Up for Grabs" data-column={UP_FOR_GRABS}>
      <ColumnHead col={{ id: UP_FOR_GRABS, profile: null, all: occ }} />
      <p class="muted pt-hint">Anyone can do these. Check one off to say who did it; they get the stars.</p>
      {open.length > 0 && (
        <div class="tk-cards">
          {open.map((o) => (
            <TaskCard key={o.id} o={o} day={day} color={UFG_COLOR} compact />
          ))}
        </div>
      )}
      {open.length === 0 && (
        <div class="pt-alldone">
          <span aria-hidden="true">🎉</span> All claimed for today!
        </div>
      )}
      {done.length > 0 && (
        <div class="pt-section">
          <h3 class="pt-section-title">
            <span class="serif">Done today</span>
            <span class="pt-section-count">{done.length}</span>
          </h3>
          <div class="tk-cards">
            {done.map((o) => (
              <TaskCard key={o.id} o={o} day={day} color={UFG_COLOR} compact />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** The header's +: a new task for the person shown (or up for grabs). */
function AddTask() {
  const who = shownPerson(
    tasksFor.value,
    profiles.value.map((p) => p.id),
    todayOccurrences.value.some((o) => o.profileId === UP_FOR_GRABS),
  );
  return (
    <IconButton label="Add task" class="ph-add" onClick={() => editTask('new', who ?? undefined)}>
      <Plus size="2.6rem" />
    </IconButton>
  );
}

export const tasksPage: PhonePage = {
  id: 'tasks',
  label: 'Tasks',
  icon: ListChecks,
  Action: AddTask,
  Body: TasksBody,
};
