import { Gift, Minus, Plus, RotateCcw, Undo2, Check } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { asParent } from '../../core/lock';
import { profileById } from '../../data/store';
import type { LedgerEntry, LedgerReason } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { adjustStars, ledgerFor, undoLedgerEntry } from '../../tasks/state';
import { Button, Chips } from '../../ui/controls';
import { Sheet, toast } from '../../ui/overlays';
import { Avatar } from '../../ui/profile';
import { historyFor } from './history-state';
import { MAX_REWARD_COST, REASON_LABEL, formatStars, relativeTime, undoable } from './logic';

/** Star history for one profile: every ledger entry newest first, with undo, plus Give / Remove stars. */
export function HistoryHost() {
  const id = historyFor.value;
  if (!id || !profileById.value.get(id)) return null;
  return <StarHistory profileId={id} onClose={() => (historyFor.value = null)} />;
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
  const entries = ledgerFor(profileId);
  const [adjust, setAdjust] = useState<'give' | 'remove' | null>(null);
  const [shown, setShown] = useState(PAGE);
  const now = currentTime();
  return (
    <Sheet title={`${p.name}'s stars`} onClose={onClose}>
      <div class="hist-head" style={{ '--c': p.color }}>
        <Avatar profile={p} size={7.2} />
        <div class="hist-balance">
          <span class="serif">{p.stars.toLocaleString()}</span>
          <span class="muted">stars</span>
        </div>
        <div class="hist-actions">
          <Button small onClick={() => void asParent(() => setAdjust('give'), 'Enter the PIN to give stars.')}>
            <Plus size="1.8rem" /> Give
          </Button>
          <Button small onClick={() => void asParent(() => setAdjust('remove'), 'Enter the PIN to remove stars.')}>
            <Minus size="1.8rem" /> Remove
          </Button>
        </div>
      </div>
      {adjust && <Adjust key={adjust} kind={adjust} balance={p.stars} profileId={profileId} onDone={() => setAdjust(null)} />}
      {entries.length === 0 ? (
        <p class="muted hist-empty">No stars yet. Completed tasks and redeemed rewards show up here.</p>
      ) : (
        <ul class="hist-list">
          {entries.slice(0, shown).map((e) => (
            <Entry e={e} now={now} />
          ))}
        </ul>
      )}
      {entries.length > shown && (
        <Button variant="ghost" onClick={() => setShown(shown + PAGE)}>
          Show older
        </Button>
      )}
    </Sheet>
  );
}

function Entry({ e, now }: { e: LedgerEntry; now: number }) {
  const Icon = ICON[e.reason];
  const sub = [REASON_LABEL[e.reason], e.note, relativeTime(e.at, now)].filter(Boolean).join(' · ');
  return (
    <li class={`hist-entry${e.undoneAt ? ' undone' : ''}`} data-reason={e.reason}>
      <span class={`hist-icon${e.delta >= 0 ? ' plus' : ''}`}>
        <Icon size="2rem" strokeWidth={2.2} />
      </span>
      <div class="hist-text">
        <span class="hist-label">{e.label}</span>
        <span class="hist-sub">
          {sub}
          {e.undoneAt ? <span class="hist-tag">Undone</span> : null}
        </span>
      </div>
      <span class={`hist-delta${e.delta < 0 ? ' minus' : ''}`}>
        {e.delta > 0 ? '+' : e.delta < 0 ? '−' : ''}
        {formatStars(Math.abs(e.delta))}
      </span>
      {undoable(e) ? (
        <button
          type="button"
          class="hist-undo"
          aria-label={`Undo ${e.label}`}
          onClick={() =>
            void asParent(() => {
              void undoLedgerEntry(e);
              toast(`Undid "${e.label}"`);
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

function Adjust({
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
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= MAX_REWARD_COST;
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
          ? `${balance.toLocaleString()} → ${after.toLocaleString()} stars`
          : `Enter a whole number from 1 to ${MAX_REWARD_COST.toLocaleString()}.`}
      </p>
      <div class="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            void asParent(() => {
              void adjustStars(profileId, kind === 'give' ? amount : -amount, note.trim() || undefined);
              toast(`${kind === 'give' ? 'Gave' : 'Removed'} ${amount} ${amount === 1 ? 'star' : 'stars'}`);
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
