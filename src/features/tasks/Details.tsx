import { CalendarDays, Clock, Pencil, Repeat, SkipForward, Star, StickyNote, Trash2, Users } from 'lucide-preact';
import { profileById, profiles, settings } from '../../data/store';
import { stillOn } from '../../tasks/state';
import { dateAt, formatLongDate, formatTime } from '../../lib/date';
import { Button, IconButton } from '../../ui/controls';
import { Modal, Popover, useCloseWhenGone } from '../../ui/overlays';
import { Avatar } from '../../ui/profile';
import { archiveTask, claimRequest, complete, detailsFor, editTask, fresh, skip, tapCheck } from './actions';
import { SECTION_META, lateLabel, repeatSummary } from './logic';
import { plural } from '../../lib/text';

/** Task details popover: when, section, repeat, who, stars, notes; Skip, Complete, Edit, Delete. */
export function DetailsHost() {
  const d = detailsFor.value;
  if (!d) return null;
  return <Details d={d} />;
}

function Details({ d }: { d: NonNullable<typeof detailsFor.value> }) {
  const o = fresh(d.o);
  useCloseWhenGone(!stillOn(o, d.day), () => (detailsFor.value = null));
  const t = o.task;
  const close = () => (detailsFor.value = null);
  const done = o.state?.status === 'done';
  const skipped = o.state?.status === 'skipped';
  const repeating = t.kind === 'routine' || !!t.repeat || !!t.repeatAfterDone;
  const fmt = settings.value.timeFormat;
  const who = t.upForGrabs || t.assignees.length === 0 ? [] : t.assignees.map((id) => profileById.value.get(id)).filter(Boolean);
  const by = done ? profileById.value.get(o.state!.by) : undefined;
  const rep = repeatSummary(t);
  return (
    <Popover anchor={d.anchor} onClose={close} width={46}>
      <div class="tk-pop" data-testid="task-details">
        <div class="tk-pop-head">
          {t.emoji && (
            <span class="tk-pop-emoji" aria-hidden="true">
              {t.emoji}
            </span>
          )}
          <h2 class="serif">
            <bdi>{t.title}</bdi>
          </h2>
          <IconButton label="Edit task" onClick={() => editTask(t)}>
            <Pencil size="2.2rem" />
          </IconButton>
          <IconButton label="Delete task" onClick={() => archiveTask(t)}>
            <Trash2 size="2.2rem" />
          </IconButton>
        </div>
        <ul class="tk-pop-rows">
          <li>
            <CalendarDays size="2rem" />
            <span>
              {formatLongDate(o.date)}
              {o.lateDays > 0 && !done && <span class="tk-late"> {lateLabel(o.lateDays)}</span>}
            </span>
          </li>
          <li>
            <Clock size="2rem" />
            <span>
              {SECTION_META[o.section].label}
              {t.kind === 'chore' && t.time ? `, due ${formatTime(dateAt(o.date, t.time), fmt)}` : ''}
            </span>
          </li>
          {rep && (
            <li>
              <Repeat size="2rem" />
              <span>{rep}</span>
            </li>
          )}
          <li>
            <Star size="2rem" />
            <span>{t.stars > 0 ? plural(t.stars, 'star') : 'No stars'}</span>
          </li>
          <li>
            <Users size="2rem" />
            <span class="tk-pop-who">
              {who.length ? (
                who.map((p) => (
                  <span class="tk-pop-person">
                    <Avatar profile={p!} size={3} />
                    {p!.name}
                  </span>
                ))
              ) : (
                <span>Up for Grabs</span>
              )}
            </span>
          </li>
          {by && (
            <li>
              <span class="tk-pop-done">✓</span>
              <span>
                Done by {by.name} at {formatTime(new Date(o.state!.at), fmt)}
                {o.state!.stars ? `, earned ${o.state!.stars}` : ''}
              </span>
            </li>
          )}
          {t.notes && (
            <li class="tk-pop-notes">
              <StickyNote size="2rem" />
              <span>{t.notes}</span>
            </li>
          )}
        </ul>
        <div class="tk-pop-actions">
          {repeating && !done && (
            <Button
              variant="ghost"
              onClick={() => {
                close();
                if (skipped) tapCheck(o, d.day, d.anchor);
                else skip(o, d.day);
              }}
            >
              <SkipForward size="2rem" /> {skipped ? 'Unskip' : 'Skip'}
            </Button>
          )}
          {!skipped && (
            <Button
              variant={done ? 'default' : 'primary'}
              onClick={() => {
                close();
                tapCheck(o, d.day, d.anchor);
              }}
            >
              {done ? 'Mark incomplete' : 'Complete'}
            </Button>
          )}
        </div>
      </div>
    </Popover>
  );
}

/** "Who did it?" for an Up for Grabs chore: one tap on a face completes it for them. */
export function ClaimHost() {
  const r = claimRequest.value;
  if (!r) return null;
  return <Claim r={r} />;
}

function Claim({ r }: { r: NonNullable<typeof claimRequest.value> }) {
  const close = () => (claimRequest.value = null);
  useCloseWhenGone(!stillOn(r.o, r.day), close);
  const t = r.o.task;
  return (
    <Modal title="Who did it?" onClose={close} actions={<Button onClick={close}>Cancel</Button>}>
      <p class="muted tk-claim-what">
        {t.emoji} {t.title}
        {t.stars ? ` · ${plural(t.stars, 'star')}` : ''}
      </p>
      {profiles.value.length === 0 && <p class="muted">Add your family in Settings, under Profiles, to give it to someone.</p>}
      <div class="tk-claim" role="group" aria-label="Who did it">
        {profiles.value.map((p) => (
          <button
            type="button"
            onClick={() => {
              close();
              complete(r.o, p.id, r.day, r.origin);
            }}
          >
            <Avatar profile={p} size={9} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
