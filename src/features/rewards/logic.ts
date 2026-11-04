import type { LedgerEntry, LedgerReason, Reward } from '../../data/types';
import { monthShort } from '../../lib/date';

/**
 * Pure helpers for rewards and the star ledger (no store access, so they
 * run in unit tests).
 */

/** Star balances as on the device: 950, 1.2K, 28.5K, 128K, 1.2M. Truncates, so it never shows more than there is. */
export function formatStars(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(Math.trunc(n));
  if (a < 1000) return `${sign}${a}`;
  const [div, suffix] = a < 1_000_000 ? [1000, 'K'] : [1_000_000, 'M'];
  const v = a / div;
  const digits = v < 100 ? 1 : 0;
  const f = Math.floor(v * 10 ** digits) / 10 ** digits;
  return `${sign}${f.toFixed(digits).replace(/\.0$/, '')}${suffix}`;
}

export const MAX_REWARD_COST = 10_000;

export function validateCost(cost: number): string | null {
  if (!Number.isInteger(cost)) return 'The cost must be a whole number of stars.';
  if (cost < 1 || cost > MAX_REWARD_COST) return `The cost must be between 1 and ${MAX_REWARD_COST.toLocaleString()} stars.`;
  return null;
}

export const canRedeem = (reward: Pick<Reward, 'profiles'>, profileId: string) =>
  reward.profiles.length === 0 || reward.profiles.includes(profileId);

export interface RewardView {
  reward: Reward;
  /** Non-renewing and already redeemed by this profile: when. */
  redeemedAt?: number;
  affordable: boolean;
  /** 0..1 progress toward the cost. */
  progress: number;
}

/** Rewards a profile can redeem, cheapest first within each `order`, with their state for that balance. */
export function rewardsFor(rewards: Reward[], profileId: string, balance: number, hideRedeemed: boolean): RewardView[] {
  return rewards
    .filter((r) => !r.archived && canRedeem(r, profileId))
    .map((reward) => {
      const redeemedAt = reward.renews ? undefined : reward.redeemedBy?.[profileId];
      return {
        reward,
        redeemedAt,
        affordable: redeemedAt === undefined && balance >= reward.cost,
        progress: Math.max(0, Math.min(1, balance / reward.cost)),
      };
    })
    .filter((v) => !(hideRedeemed && v.redeemedAt !== undefined))
    .sort(
      (a, b) =>
        Number(a.redeemedAt !== undefined) - Number(b.redeemedAt !== undefined) ||
        a.reward.order - b.reward.order ||
        a.reward.cost - b.reward.cost,
    );
}

/** Reversal entries (un-check, unredeem, undo) cannot themselves be undone. */
export const undoable = (e: LedgerEntry) =>
  !e.undoneAt && (['task', 'give', 'remove', 'redeem'] as LedgerReason[]).includes(e.reason);

export const REASON_LABEL: Record<LedgerReason, string> = {
  task: 'Task done',
  untask: 'Task unchecked',
  give: 'Stars given',
  remove: 'Stars removed',
  redeem: 'Reward redeemed',
  unredeem: 'Redeem undone',
  undo: 'Undone',
};

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "Mon", "Oct 12", "Oct 12, 2025". */
export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, now - at) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  const a = new Date(at);
  const n = new Date(now);
  const dayDiff = Math.round(
    (Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000,
  );
  if (dayDiff === 0) return `${Math.floor(s / 3600)} h ago`;
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][a.getDay()];
  const md = `${monthShort(a.getMonth())} ${a.getDate()}`;
  return a.getFullYear() === n.getFullYear() ? md : `${md}, ${a.getFullYear()}`;
}

/** "November 4, 2026" for the redeemed dialog. */
export function longDay(at: number): string {
  const d = new Date(at);
  return `${d.toLocaleString('en-US', { month: 'long' })} ${d.getDate()}, ${d.getFullYear()}`;
}
