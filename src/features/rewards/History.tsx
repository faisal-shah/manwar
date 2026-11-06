import { Gift, Minus, Plus, RotateCcw, Undo2, Check } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { asParent } from '../../core/lock';
import { profileById } from '../../data/store';
import type { LedgerEntry, LedgerReason } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { adjustStars, ledgerFor, undoLedgerEntry } from '../../tasks/state';
import { Button, Chips } from '../../ui/controls';
import { Sheet, swallowRestOfTap, toast } from '../../ui/overlays';
import { Avatar } from '../../ui/profile';
import { historyFor, loadOlderLedger, moreLedger, olderLedger } from './history-state';
import { MAX_REWARD_COST, REASON_LABEL, formatStars, relativeTime, undoable } from './logic';
import { isolate, plural, pluralWord } from '../../lib/text';

/** Star history for one profile: every ledger entry newest first, with undo, plus Give / Remove stars. */
export function HistoryHost() {
  const id = historyFor.value;
  if (!id || !profileById.value.get(id)) return null;
  return <StarHistory key={id} profileId={id} onClose={() => (historyFor.value = null)} />;
}

const ICON: Record<LedgerReason, typeof Check> = {
  task: Check,
  untask: RotateCcw,
  give: Plus,
  remove: Minus,
  redeem: Gift,
  unredeem: RotateCcw,
  undo: RotateCcw,
};

const PAGE = 60;

function StarHistory({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const p = profileById.value.get(profileId)!;
  const [adjust, setAdjust] = useState<'give' | 'remove' | null>(null);
  return (
    <Sheet title={`${isolate(p.name)}'s stars`} onClose={onClose}>
      <div class="hist-head" style={{ '--c': p.color }}>
        <Avatar profile={p} size={7.2} />
        <div class="hist-balance">
          <span class="serif">{p.stars.toLocaleString()}</span>
          <span class="muted">{pluralWord(p.stars, 'star')}</span>
        </div>
        <div class="hist-actions">
          <Button small onClick={() => askAdjust('give', setAdjust)}>
            <Plus size="1.8rem" /> Give
          </Button>
          <Button small onClick={() => askAdjust('remove', setAdjust)}>
            <Minus size="1.8rem" /> Remove
          </Button>
        </div>
      </div>
      {adjust && <Adjust key={adjust} kind={adjust} balance={p.stars} profileId={profileId} onDone={() => setAdjust(null)} />}
      <HistoryList profileId={profileId} />
    </Sheet>
  );
}

/** Open the Give or Remove form (`open`) once a parent has entered the PIN. */
export const askAdjust = (kind: 'give' | 'remove', open: (kind: 'give' | 'remove') => void) =>
  void asParent(() => open(kind), kind === 'give' ? 'Enter the PIN to give stars.' : 'Enter the PIN to remove stars.');

/**
 * A profile's ledger entries, newest first, with Undo; Show older pages
 * past the store's live window (those are shown without Undo).
 */
export function HistoryList({ profileId }: { profileId: string }) {
  const live = ledgerFor(profileId);
  const liveIds = new Set(live.map((e) => e.id));
  // Entries older than the store's live window, once asked for: shown after the live ones, without Undo.
  const older = olderLedger.value.filter((e) => e.profileId === profileId && !liveIds.has(e.id)).sort((a, b) => b.at - a.at);
  const entries = [...live, ...older];
  const [shown, setShown] = useState(PAGE);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const now = currentTime();
  const showOlder = () => {
    if (entries.length > shown) return setShown(shown + PAGE);
    setLoadingOlder(true);
    void loadOlderLedger(profileId, PAGE)
      .then(() => setShown(shown + PAGE))
      .catch(() => toast('Older stars could not be loaded. Try again once the wall is online.'))
      .finally(() => setLoadingOlder(false));
  };
  return (
    <>
      {entries.length === 0 ? (
        <p class="muted hist-empty">
          {moreLedger.value ? 'Nothing recent.' : 'No stars yet. Completed tasks and redeemed rewards show up here.'}
        </p>
      ) : (
        <ul class="hist-list">
          {entries.slice(0, shown).map((e) => (
            <Entry e={e} now={now} readOnly={!liveIds.has(e.id)} />
          ))}
        </ul>
      )}
      {(entries.length > shown || moreLedger.value) && (
        <Button variant="ghost" disabled={loadingOlder} onClick={showOlder}>
          {loadingOlder ? 'Loading…' : 'Show older'}
        </Button>
      )}
    </>
  );
}

function Entry({ e, now, readOnly }: { e: LedgerEntry; now: number; readOnly: boolean }) {
  const Icon = ICON[e.reason];
  const sub = [REASON_LABEL[e.reason], e.note, relativeTime(e.at, now)].filter(Boolean).join(' · ');
  return (
    <li class={`hist-entry${e.undoneAt ? ' undone' : ''}`} data-reason={e.reason}>
      <span class={`hist-icon${e.delta >= 0 ? ' plus' : ''}`}>
        <Icon size="2rem" strokeWidth={2.2} />
      </span>
      <div class="hist-text">
        <span class="hist-label" dir="auto">
          {e.label}
        </span>
        <span class="hist-sub">
          {sub}
          {e.undoneAt ? <span class="hist-tag">Undone</span> : null}
        </span>
      </div>
      <span class={`hist-delta${e.delta < 0 ? ' minus' : ''}`}>
        {e.delta > 0 ? '+' : e.delta < 0 ? '−' : ''}
        {formatStars(Math.abs(e.delta))}
      </span>
      {undoable(e) && !readOnly ? (
        <button
          type="button"
          class="hist-undo"
          aria-label={`Undo ${e.label}`}
          onClick={() =>
            void asParent(() => {
              if (undoLedgerEntry(e)) toast(`Undid "${isolate(e.label)}"`);
            }, 'Enter the PIN to undo stars.')
          }
        >
          <Undo2 size="1.8rem" /> Undo
        </button>
      ) : (
        <span class="hist-undo-spacer" />
      )}
    </li>
  );
}

/** Give or Remove stars: an amount, an optional note, the balance it leaves. */
export function Adjust({
  kind,
  balance,
  profileId,
  onDone,
}: {
  kind: 'give' | 'remove';
  balance: number;
  profileId: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(kind === 'give' ? 5 : 1);
  const [text, setText] = useState(String(amount));
  const [note, setNote] = useState('');
  // Removing stops at the balance shown here. Stars spent meanwhile on another device that have not arrived yet can
  // still take the balance below zero, which the rules allow: a removal is a parent's call.
  const max = kind === 'remove' ? Math.min(MAX_REWARD_COST, balance) : MAX_REWARD_COST;
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= max;
  const after = balance + (kind === 'give' ? amount : -amount);
  const set = (n: number) => {
    setAmount(n);
    setText(String(n));
  };
  return (
    <div class="hist-adjust">
      <h3 class="serif">{kind === 'give' ? 'Give stars' : 'Remove stars'}</h3>
      <div class="row" style={{ flexWrap: 'wrap' }}>
        <Chips<number>
          value={[amount]}
          options={[1, 2, 5, 10, 25, 50].map((n) => ({ value: n, label: String(n) }))}
          onChange={([n]) => set(n)}
        />
        <input
          class="input"
          style={{ width: '12rem' }}
          inputMode="numeric"
          aria-label="Number of stars"
          value={text}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value.replace(/\D/g, '');
            setText(v);
            setAmount(v ? Number(v) : 0);
          }}
        />
      </div>
      <input
        class="input"
        placeholder="Note (optional), e.g. Helped with groceries"
        value={note}
        maxLength={80}
        onInput={(e) => setNote((e.target as HTMLInputElement).value)}
      />
      <p class={valid ? 'muted' : 'hist-error'}>
        {valid
          ? `${balance.toLocaleString()} → ${plural(after, 'star')}`
          : max < 1
            ? 'There are no stars to remove.'
            : `Enter a whole number from 1 to ${max.toLocaleString()}.`}
      </p>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        <Button
          variant="ghost"
          onClick={() => {
            // The form closes and the history moves up under the finger.
            swallowRestOfTap();
            onDone();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            void asParent(() => {
              // Written here at once, as every star write is; a refusal from the server rolls it back and says so.
              if (!adjustStars(profileId, kind === 'give' ? amount : -amount, note.trim() || undefined)) return;
              swallowRestOfTap();
              toast(`${kind === 'give' ? 'Gave' : 'Removed'} ${plural(amount, 'star')}`);
              onDone();
            })
          }
        >
          {kind === 'give' ? `Give ${amount || ''}` : `Remove ${amount || ''}`}
        </Button>
      </div>
    </div>
  );
}
