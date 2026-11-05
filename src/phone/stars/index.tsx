import { ChevronRight, Plus, Star } from 'lucide-preact';
import { data, profileById, profiles } from '../../data/store';
import { plural } from '../../lib/text';
import { editReward } from '../../features/rewards/actions';
import { openHistory } from '../../features/rewards/history-state';
import { formatStars } from '../../features/rewards/logic';
import { Button } from '../../ui/controls';
import { Avatar, everyoneProfile } from '../../ui/profile';
import type { MoreItem } from '../more/items';
import { StarsHost } from './PersonStars';

/**
 * More > Stars and rewards: each person's balance (a tap opens their stars:
 * give, remove, redeem, history), and the household's rewards to add and
 * edit.
 */
function StarsView() {
  const people = profiles.value;
  const rewards = data.rewards.value.filter((r) => !r.archived).sort((a, b) => a.order - b.order || a.cost - b.cost);
  return (
    <div class="ph-stack">
      <section class="ph-card" aria-label="Stars">
        <h2 class="ph-card-title">Stars</h2>
        {people.length === 0 ? (
          <p class="muted">No people yet. People are added at the wall, in Settings, under Profiles.</p>
        ) : (
          <ul class="psv-people">
            {people.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  class="psv-person"
                  data-person={p.id}
                  aria-label={`${p.name}, ${plural(p.stars, 'star')}`}
                  onClick={() => openHistory(p.id)}
                >
                  <Avatar profile={p} size={4.4} />
                  <span class="psv-name" dir="auto">
                    {p.name}
                  </span>
                  <span class="psv-balance">
                    <Star class="star-icon" size="1.8rem" strokeWidth={2} />
                    {formatStars(p.stars)}
                  </span>
                  <ChevronRight size="2rem" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section class="ph-card" aria-label="Rewards">
        <h2 class="ph-card-title">Rewards</h2>
        {rewards.length === 0 && <p class="muted">No rewards yet: a treat, an outing, a later bedtime. Stars buy them.</p>}
        <ul class="psv-rewards">
          {rewards.map((r) => {
            const who = r.profiles.map((id) => profileById.value.get(id)).filter((p) => !!p);
            return (
              <li key={r.id}>
                <button type="button" class="psv-reward" data-reward={r.title} onClick={() => editReward(r)}>
                  <span class="ps-reward-emoji" aria-hidden="true">
                    {r.emoji ?? '🎁'}
                  </span>
                  <span class="ps-reward-text">
                    <span class="ps-reward-title" dir="auto">
                      {r.title}
                    </span>
                    <span class="ps-reward-sub">
                      {plural(r.cost, 'star')}
                      {r.renews ? '' : ', once each'}
                    </span>
                  </span>
                  <span class="psv-who" aria-label={who.length ? who.map((p) => p.name).join(', ') : 'Everyone'}>
                    {(who.length ? who : [everyoneProfile()]).slice(0, 3).map((p) => (
                      <Avatar profile={p} size={2.8} />
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <Button class="ps-add" onClick={() => editReward('new')}>
          <Plus size="2rem" /> Add a reward
        </Button>
      </section>
      <StarsHost />
    </div>
  );
}

export const starsItem: MoreItem = {
  id: 'stars',
  label: 'Stars and rewards',
  icon: Star,
  hint: () => {
    const n = data.rewards.value.filter((r) => !r.archived).length;
    return profiles.value.length ? `Balances, history, ${plural(n, 'reward')}` : null;
  },
  View: StarsView,
};
