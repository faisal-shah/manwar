import { signal } from '@preact/signals';
import { asParent } from '../../core/lock';
import { playCelebrate } from '../../core/sound';
import { data, patch } from '../../data/store';
import type { Profile, Reward } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { redeemReward, undoLedgerEntry } from '../../tasks/state';
import { confirm, toast } from '../../ui/overlays';

/** Reward editor: a reward, 'new', or closed. */
export const editingReward = signal<Reward | 'new' | null>(null);
/** The redeemed dialog. */
export const redeemed = signal<{ reward: Reward; profileId: string; at: number } | null>(null);

export const editReward = (r: Reward | 'new') =>
  void asParent(() => (editingReward.value = r), 'Enter the PIN to add or change rewards.');

/** Redeeming spends stars, so it asks for the parent PIN; then the celebration. */
export function redeem(reward: Reward, p: Profile): void {
  void asParent(() => {
    if (p.stars < reward.cost) return;
    const at = currentTime();
    void redeemReward(reward, p.id);
    playCelebrate();
    redeemed.value = { reward, profileId: p.id, at };
  }, `Enter the PIN to redeem ${reward.title}.`);
}

/** Reverse the redemption shown in the dialog (refunds the stars). */
export function unredeem(r: { reward: Reward; profileId: string; at: number }): void {
  const entry = data.ledger.value
    .filter((e) => e.reason === 'redeem' && e.ref === r.reward.id && e.profileId === r.profileId && !e.undoneAt && e.at >= r.at)
    .sort((a, b) => b.at - a.at)[0];
  if (entry) void undoLedgerEntry(entry);
  redeemed.value = null;
  toast(`${r.reward.title} unredeemed, ${r.reward.cost} stars back`);
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
