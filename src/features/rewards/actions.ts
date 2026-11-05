import { signal } from '@preact/signals';
import { asParent } from '../../core/lock';
import { playCelebrate } from '../../core/sound';
import { data, patch, profileById } from '../../data/store';
import type { LedgerEntry, Profile, Reward } from '../../data/types';
import { redeemReward, undoLedgerEntry } from '../../tasks/state';
import { confirm, toast } from '../../ui/overlays';
import { formatStars, rewardsFor } from './logic';

/** Reward editor: a reward, 'new', or closed. */
export const editingReward = signal<Reward | 'new' | null>(null);

export interface Redeemed {
  reward: Reward;
  profileId: string;
  /** The ledger entry that spent the stars (its `at` is the redemption time). */
  entry: LedgerEntry;
}
/** The redeemed dialog. */
export const redeemed = signal<Redeemed | null>(null);

export const editReward = (r: Reward | 'new') =>
  void asParent(() => (editingReward.value = r), 'Enter the PIN to add or change rewards.');

/**
 * Redeeming spends stars, so it asks for the parent PIN; then the
 * celebration. Eligibility, cost and balance are read again after the PIN,
 * since any of them may have changed while it was being entered.
 */
export function redeem(reward: Reward, p: Profile): void {
  void asParent(() => {
    const balance = profileById.value.get(p.id)?.stars ?? 0;
    const view = rewardsFor(data.rewards.value, p.id, balance, false).find((v) => v.reward.id === reward.id);
    if (!view?.affordable) {
      if (view && view.redeemedAt === undefined)
        toast(`${p.name} needs ${formatStars(view.reward.cost)} stars for ${view.reward.title}.`);
      return;
    }
    const entry = redeemReward(view.reward, p.id);
    if (!entry) return;
    playCelebrate();
    redeemed.value = { reward: view.reward, profileId: p.id, entry };
  }, `Enter the PIN to redeem ${reward.title}.`);
}

/** Reverse the redemption shown in the dialog (refunds the stars); a refund needs the parent too. */
export function unredeem(r: Redeemed): void {
  void asParent(() => {
    redeemed.value = null;
    if (!undoLedgerEntry(r.entry)) return;
    const n = -r.entry.delta;
    toast(`${r.reward.title} unredeemed, ${n.toLocaleString()} ${n === 1 ? 'star' : 'stars'} back`);
  }, 'Enter the PIN to undo the redemption.');
}

export function archiveReward(r: Reward): void {
  void asParent(async () => {
    const ok = await confirm(`Delete "${r.title}"?`, {
      body: 'Stars already spent on it stay spent.',
      ok: 'Delete',
      danger: true,
    });
    if (!ok) return;
    void patch('rewards', r.id, { archived: true });
    editingReward.value = null;
    toast(`Deleted "${r.title}"`, { label: 'Undo', run: () => void patch('rewards', r.id, { archived: false }) });
  }, 'Enter the PIN to delete a reward.');
}
