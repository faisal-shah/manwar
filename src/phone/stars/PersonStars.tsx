import { Minus, Plus, Star } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { data, profileById } from '../../data/store';
import type { Profile } from '../../data/types';
import { monthShort } from '../../lib/date';
import { plural, pluralWord } from '../../lib/text';
import { editReward, redeem } from '../../features/rewards/actions';
import { RewardEditorHost } from '../../features/rewards/Editor';
import { Adjust, HistoryList, askAdjust } from '../../features/rewards/History';
import { historyFor } from '../../features/rewards/history-state';
import { formatStars, rewardsFor, type RewardView } from '../../features/rewards/logic';
import { RedeemedHost } from '../../features/rewards/RewardsView';
import { Button } from '../../ui/controls';
import { Sheet } from '../../ui/overlays';
import { Avatar } from '../../ui/profile';
import '../../features/tasks/columns.css';
import '../../features/rewards/rewards.css';
import './stars.css';

/** A name kept whole in a sentence of the other direction (an Arabic name in "...'s stars"). */
export const isolate = (s: string) => `⁨${s}⁩`;

/**
 * One person's stars on the phone: the balance, Give and Remove, the
 * rewards they can redeem, and the star history with Undo. It opens where
 * the wall opens its star history (openHistory: a star pill, a row in
 * Stars and rewards), so this host takes the wall's place on the phone,
 * with the reward editor and the redeemed dialog.
 */
export function StarsHost() {
  const id = historyFor.value;
  const p = id ? profileById.value.get(id) : undefined;
  return (
    <>
      {p && <PersonStars key={p.id} p={p} onClose={() => (historyFor.value = null)} />}
      <RewardEditorHost />
      <RedeemedHost />
    </>
  );
}

function PersonStars({ p, onClose }: { p: Profile; onClose: () => void }) {
  const [adjust, setAdjust] = useState<'give' | 'remove' | null>(null);
  const rewards = rewardsFor(data.rewards.value, p.id, p.stars, false);
  return (
    <Sheet title={`${isolate(p.name)}'s stars`} onClose={onClose}>
      <div class="ps" style={{ '--c': p.color }}>
        <div class="ps-balance">
          <Avatar profile={p} size={6.4} />
          <div class="ps-num">
            <Star class="star-icon" size="3rem" strokeWidth={2} />
            <span class="serif">{p.stars.toLocaleString()}</span>
            <span class="muted">{pluralWord(p.stars, 'star')}</span>
          </div>
        </div>
        <div class="ps-actions">
          <Button onClick={() => askAdjust('give', setAdjust)}>
            <Plus size="2rem" /> Give
          </Button>
          <Button onClick={() => askAdjust('remove', setAdjust)}>
            <Minus size="2rem" /> Remove
          </Button>
        </div>
        {adjust && <Adjust key={adjust} kind={adjust} balance={p.stars} profileId={p.id} onDone={() => setAdjust(null)} />}

        <h3 class="ps-title serif">Rewards</h3>
        {rewards.length === 0 ? (
          <p class="muted">
            Nothing for <bdi>{p.name}</bdi> to work toward yet.
          </p>
        ) : (
          <ul class="ps-rewards">
            {rewards.map((v) => (
              <RewardRow key={v.reward.id} v={v} p={p} />
            ))}
          </ul>
        )}
        <Button variant="ghost" class="ps-add" onClick={() => editReward('new')}>
          <Plus size="2rem" /> Add a reward
        </Button>

        <h3 class="ps-title serif">History</h3>
        <HistoryList profileId={p.id} />
      </div>
    </Sheet>
  );
}

const shortDay = (at: number) => {
  const d = new Date(at);
  return `${monthShort(d.getMonth())} ${d.getDate()}`;
};

/** A reward for one person: Redeem when the balance covers it, how far along otherwise, or when it was redeemed. */
function RewardRow({ v, p }: { v: RewardView; p: Profile }) {
  const r = v.reward;
  const done = v.redeemedAt !== undefined;
  return (
    <li class={`ps-reward${done ? ' redeemed' : ''}`} data-reward={r.title}>
      <button type="button" class="ps-reward-body" aria-label={`${r.title}, edit`} onClick={() => editReward(r)}>
        <span class="ps-reward-emoji" aria-hidden="true">
          {r.emoji ?? '🎁'}
        </span>
        <span class="ps-reward-text">
          <span class="ps-reward-title">
            <bdi>{r.title}</bdi>
          </span>
          <span class="ps-reward-sub">
            {done
              ? `Redeemed on ${shortDay(v.redeemedAt!)}`
              : v.affordable
                ? plural(r.cost, 'star')
                : `${formatStars(p.stars)} of ${formatStars(r.cost)} ${pluralWord(r.cost, 'star')}`}
          </span>
          {!done && !v.affordable && <span class="ps-reward-bar" style={{ '--p': `${v.progress * 100}%` }} aria-hidden="true" />}
        </span>
      </button>
      {v.affordable && (
        <button type="button" class="ps-redeem" onClick={() => redeem(r, p)}>
          Redeem
        </button>
      )}
    </li>
  );
}
