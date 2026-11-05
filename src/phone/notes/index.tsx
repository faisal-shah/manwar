import './notes.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { StickyNote } from 'lucide-preact';
import { asParent } from '../../core/lock';
import { profileById, profiles } from '../../data/store';
import type { Message } from '../../data/types';
import { MAX_MESSAGE_LENGTH, timeAgo } from '../../features/messages/logic';
import { dismissMessage, pending, postMessage } from '../../features/messages/state';
import { nowMs } from '../../lib/clock';
import { Button, Field, SettingRow, Toggle } from '../../ui/controls';
import { stored } from '../../lib/stored';
import { toast } from '../../ui/overlays';
import { Avatar, ProfilePicker } from '../../ui/profile';
import type { MoreItem } from '../more/items';
import { askWall, wallSeemsAsleep } from '../wallscreen';

/** Who this phone's notes are usually from, remembered on the phone. */
const usualFrom = stored<string | null>(
  'manwar.phone.noteFrom.v1',
  null,
  (v): v is string | null => v === null || typeof v === 'string',
);

/**
 * The note being written, until it is posted: kept when the view closes
 * (Back mid-sentence) and, in sessionStorage, through a reload (an update
 * applied while the phone sat idle, the browser restoring the tab).
 */
const draft = stored('manwar.phone.noteDraft.v1', '', (v): v is string => typeof v === 'string', 'session');

/** More > Note to the wall: write a note that pops up on the wall; see and dismiss what it shows. */
function NoteView() {
  const text = draft.value;
  const setText = (v: string) => (draft.value = v);
  const [chosen, setChosen] = useState<string | undefined>(() => usualFrom.peek() ?? undefined);
  // A remembered profile deleted since is no one.
  const from = chosen && profileById.value.has(chosen) ? chosen : undefined;
  const [readAloud, setReadAloud] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const postBtn = useRef<HTMLButtonElement>(null);
  useKeepInView(field, postBtn);
  const body = text.trim();
  const post = () =>
    void asParent(() => {
      postMessage(body, from, readAloud);
      setText('');
      setReadAloud(false);
      field.current?.blur();
      toast('Posted to the wall.');
    }, 'Enter the PIN to post a note.');
  // Newest first, as the wall shows them: the first is on screen, the rest come after it is dismissed.
  const notes = pending.value;
  return (
    <div class="ph-stack">
      <section class="ph-card pn-compose">
        {/* A household with nobody in it yet has no one to send it from. */}
        {profiles.value.length > 0 && (
          <Field label="From">
            <ProfilePicker
              value={from ? [from] : []}
              onChange={(ids) => {
                const next = ids.find((id) => id !== from);
                setChosen(next);
                usualFrom.value = next ?? null;
              }}
            />
          </Field>
        )}
        <Field label="Note">
          <textarea
            ref={field}
            class="input pn-input"
            aria-label="Note"
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Write a note for the family"
            value={text}
            onInput={(e: TargetedEvent<HTMLTextAreaElement>) => setText(e.currentTarget.value)}
          />
          <span class="pn-count">
            {text.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </Field>
        <SettingRow label="Read it aloud" hint="The wall speaks the note once when it appears, unless its sounds are off.">
          <Toggle label="Read it aloud" on={readAloud} onChange={setReadAloud} />
        </SettingRow>
        <button ref={postBtn} type="button" class="btn btn-primary pn-post" disabled={!body} onClick={post}>
          <StickyNote size="2.2rem" /> Post to the wall
        </button>
      </section>
      <section class="ph-card" aria-live="polite">
        <h2 class="ph-card-title">On the wall now</h2>
        {notes.length ? (
          <>
            {wallSeemsAsleep.value && (
              <div class="pn-asleep">
                <p>The wall is likely asleep: it shows the note when someone wakes it.</p>
                <Button small onClick={() => askWall('wake')}>
                  Wake the wall
                </Button>
              </div>
            )}
            <ul class="pn-notes">
              {notes.map((m, i) => (
                <NoteRow key={m.id} m={m} waiting={i > 0} />
              ))}
            </ul>
          </>
        ) : (
          <p class="muted">No note on the wall.</p>
        )}
      </section>
    </div>
  );
}

function NoteRow({ m, waiting }: { m: Message; waiting: boolean }) {
  const author = m.from ? profileById.value.get(m.from) : undefined;
  return (
    <li class="pn-note">
      <span class={`pn-tag${waiting ? '' : ' on'}`}>{waiting ? 'Waiting' : 'Showing'}</span>
      <p class="pn-text" dir="auto">
        {m.text}
      </p>
      <div class="pn-meta">
        {author && <Avatar profile={author} size={3.2} />}
        <span class="pn-meta-text">
          {author && (
            <>
              From <bdi>{author.name}</bdi> ·{' '}
            </>
          )}
          {timeAgo(m.createdAt, nowMs.value)}
        </span>
        {/* Anyone at the wall may dismiss a note; so may a phone. */}
        <Button small onClick={() => dismissMessage(m.id)} aria-label={`Dismiss: ${m.text}`}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}

/**
 * While the note is being typed and the on-screen keyboard takes the lower
 * part of the screen (the page gets shorter), keep the Post button in view
 * under the field.
 */
function useKeepInView(field: { current: HTMLElement | null }, target: { current: HTMLElement | null }) {
  useEffect(() => {
    const onResize = () => {
      if (document.activeElement === field.current)
        requestAnimationFrame(() => target.current?.scrollIntoView({ block: 'nearest' }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
}

/** A note's text for the More row: short, and isolated so an Arabic one keeps its own direction. */
function hintText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return `\u2068${flat.length > 40 ? `${flat.slice(0, 39)}…` : flat}\u2069`;
}

export const notesItem: MoreItem = {
  id: 'note',
  label: 'Note to the wall',
  icon: StickyNote,
  hint: () => {
    const m = pending.value[0];
    return m ? `On the wall: ${hintText(m.text)}` : null;
  },
  View: NoteView,
};
