import { signal } from '@preact/signals';
import { Star } from 'lucide-preact';
import { createPortal } from 'preact/compat';
import { data, profileById, profiles } from '../../data/store';
import type { Profile } from '../../data/types';
import { monthShort } from '../../lib/date';
import { Button } from '../../ui/controls';
import { Avatar } from '../../ui/profile';
import { editReward, redeem, redeemed, unredeem } from './actions';
import { formatStars, longDay, rewardsFor, type RewardView } from './logic';
import { StarPill } from './StarPill';

export const hideRedeemed = signal(false);

/** One column per profile: balance and the rewards they can redeem. */
export function RewardsView() {
  return (
    <div class="pcols" data-count={profiles.value.length}>
      {profiles.value.map((p) => (
        <RewardColumn key={p.id} p={p} />
      ))}
    </div>
  );
}

function RewardColumn({ p }: { p: Profile }) {
  const items = rewardsFor(data.rewards.value, p.id, p.stars, hideRedeemed.value);
  return (
    <section class="pcol rw-col" style={{ '--c': p.color }} aria-label={p.name} data-column={p.id}>
      <header class="pcol-head">
        <Avatar profile={p} size={5.6} />
        <div class="pcol-id">
          <span class="pcol-name serif">{p.name}</span>
          <div class="pcol-pills">
            <StarPill profileId={p.id} value={p.stars} />
          </div>
        </div>
      </header>
      <div class="pcol-body scroll">
        {items.length === 0 ? (
          <div class="rw-empty">
            <span aria-hidden="true">🎯</span>
            Ready for a new goal? Tap + to add a reward.
          </div>
        ) : (
          <div class="rw-cards">
            {items.map((v) => (
              <RewardCard key={v.reward.id} v={v} p={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function shortDay(at: number) {
  const d = new Date(at);
  return `${monthShort(d.getMonth())} ${d.getDate()}`;
}

function RewardCard({ v, p }: { v: RewardView; p: Profile }) {
  const r = v.reward;
  return (
    <div class={`rw-card${v.redeemedAt !== undefined ? ' redeemed' : ''}`} data-reward={r.title}>
      <button type="button" class="rw-body" aria-label={`${r.title}, edit`} onClick={() => editReward(r)}>
        <span class="rw-emoji" aria-hidden="true">
          {r.emoji ?? '🎁'}
        </span>
        <span class="rw-title serif">{r.title}</span>
      </button>
      {v.redeemedAt !== undefined ? (
        <span class="rw-state">Redeemed on {shortDay(v.redeemedAt)}</span>
      ) : v.affordable ? (
        <button type="button" class="rw-redeem" onClick={() => redeem(r, p)}>
          Redeem <Star size="1.8rem" class="star-icon" /> {formatStars(r.cost)}
        </button>
      ) : (
        <div class="rw-progress" style={{ '--p': `${v.progress * 100}%` }} aria-label={`${p.stars} of ${r.cost} stars`}>
          <Star size="1.6rem" />
          {formatStars(p.stars)}/{formatStars(r.cost)}
        </div>
      )}
    </div>
  );
}

const BURST = Array.from({ length: 30 }, (_, i) => ({
  a: (i / 30) * 360 + (i % 3) * 9,
  d: 20 + ((i * 7) % 5) * 8,
  s: 2.2 + (i % 4) * 0.8,
  delay: (i % 6) * 45,
}));

/** Centered dialog over a gold glow with a star burst: Done, or Undo to refund. */
export function RedeemedHost() {
  const r = redeemed.value;
  if (!r) return null;
  const p = profileById.value.get(r.profileId);
  const close = () => (redeemed.value = null);
  return createPortal(
    <div class="rw-celebrate" style={{ '--c': p?.color ?? 'var(--accent)' }}>
      <div class="scrim top" onClick={close} />
      <div class="rw-glow" aria-hidden="true" />
      <div class="rw-burst" aria-hidden="true">
        {BURST.map((b) => (
          <span style={{ '--a': `${b.a}deg`, '--d': `${b.d}rem`, fontSize: `${b.s}rem`, animationDelay: `${b.delay}ms` }}>★</span>
        ))}
      </div>
      <div class="rw-dialog" role="dialog" aria-label="Reward redeemed">
        <span class="rw-dialog-emoji" aria-hidden="true">
          {r.reward.emoji ?? '🎁'}
        </span>
        <h2 class="serif">Great work! {r.reward.title} redeemed</h2>
        <p class="muted">
          By {p?.name ?? 'someone'} for {r.reward.cost.toLocaleString()} stars on {longDay(r.at)}.
        </p>
        <Button variant="primary" onClick={close}>
          Done
        </Button>
        <Button variant="ghost" onClick={() => unredeem(r)}>
          Undo
        </Button>
      </div>
    </div>,
    document.body,
  );
}
