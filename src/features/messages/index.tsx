import { useEffect, useState } from 'preact/hooks';
import { Play, StickyNote } from 'lucide-preact';
import { sleeping } from '../../core/display';
import { playChime } from '../../core/sound';
import { asParent } from '../../core/lock';
import { profileById, settings } from '../../data/store';
import type { Message } from '../../data/types';
import { nowMs } from '../../lib/clock';
import { Button, Field } from '../../ui/controls';
import { Sheet } from '../../ui/overlays';
import { Avatar, ProfilePicker } from '../../ui/profile';
import { MAX_MESSAGE_LENGTH, messageSize, timeAgo } from './logic';
import { canSpeak, composerOpen, dismissMessage, openComposer, pending, postMessage, speak } from './state';
import './messages.css';
import { plural } from '../../lib/text';

export { openComposer } from './state';

/** Top-bar button that opens the message composer (Home tab). */
export function MessageButton() {
  return (
    <button type="button" class="ctl message-btn" onClick={openComposer}>
      <StickyNote size="2.2rem" strokeWidth={2} />
      Message
    </button>
  );
}

function Composer() {
  const [text, setText] = useState('');
  const [from, setFrom] = useState<string | undefined>();
  const [readAloud, setReadAloud] = useState(false);
  const close = () => (composerOpen.value = false);
  const body = text.trim();
  const post = () =>
    asParent(() => {
      postMessage(body, from, readAloud);
      close();
    }, 'Enter the PIN to post a message.');
  return (
    <Sheet
      title="New message"
      onClose={close}
      footer={
        <>
          <Button class="message-foot-btn" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" class="message-foot-btn" disabled={!body} onClick={post}>
            Post to the wall
          </Button>
        </>
      }
    >
      <Field label="Message">
        <textarea
          class="input message-input"
          dir="auto"
          aria-label="Message"
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Write a note for the family"
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          autoFocus
        />
        <span class="message-count">
          {text.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </Field>
      <Field label="From">
        <ProfilePicker value={from ? [from] : []} onChange={(ids) => setFrom(ids.find((id) => id !== from))} />
      </Field>
      {canSpeak() && (
        <button
          type="button"
          role="switch"
          aria-checked={readAloud}
          class="message-switch"
          onClick={() => setReadAloud(!readAloud)}
        >
          <span>
            Read aloud when it appears
            <small>The wall speaks the message once, unless sounds are off.</small>
          </span>
          <span class={`toggle${readAloud ? ' on' : ''}`} aria-hidden="true" />
        </button>
      )}
    </Sheet>
  );
}

/** The sticky note's paper color (Skylight yellow), tinted for dark mode in messages.css. */
const NOTE_COLOR = '#FBD97F';
const SPEAK_AFTER_CHIME_MS = 1700;
/** Messages already announced on this wall (chime, read aloud). */
const announced = new Set<string>();

function Note({ m, more }: { m: Message; more: number }) {
  const author = m.from ? profileById.value.get(m.from) : undefined;
  // A message that arrives while the wall sleeps waits, silent behind the sleep screen, until someone wakes it.
  const asleep = sleeping.value;
  useEffect(() => {
    if (asleep || announced.has(m.id)) return;
    announced.add(m.id);
    playChime();
    if (!m.readAloud || !settings.value.sounds) return;
    const id = setTimeout(() => speak(m.text), SPEAK_AFTER_CHIME_MS);
    return () => clearTimeout(id);
  }, [m.id, asleep]);
  return (
    <div class="message-layer" role="dialog" aria-label="Message">
      <article class="message-note" style={{ '--c': NOTE_COLOR }}>
        <div class="message-content">
          <p class={`message-text size-${messageSize(m.text)}`} dir="auto">
            {m.text}
          </p>
          <p class="message-meta">
            {author && (
              <>
                From: {author.name}
                <Avatar profile={author} size={4.4} />
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{timeAgo(m.createdAt, nowMs.value)}</span>
          </p>
          <div class="message-actions">
            <button type="button" class="message-ok" onClick={() => dismissMessage(m.id)}>
              OK!
            </button>
            {canSpeak() && (
              <button type="button" class="message-play" aria-label="Read aloud" onClick={() => speak(m.text)}>
                <Play size="3.2rem" strokeWidth={2} />
              </button>
            )}
          </div>
          {more > 0 && <p class="message-more">{plural(more, 'more message', 'more messages')} after this</p>}
        </div>
      </article>
    </div>
  );
}

/** Full-screen message shown until someone taps OK, plus the composer host. */
export function MessageOverlay() {
  const [m, ...rest] = pending.value;
  return (
    <>
      {composerOpen.value && <Composer />}
      {m && <Note key={m.id} m={m} more={rest.length} />}
    </>
  );
}
