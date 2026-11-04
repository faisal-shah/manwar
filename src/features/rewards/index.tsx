import { EyeOff, Star } from 'lucide-preact';
import type { TabDef } from '../../app/tab';
import { editReward } from './actions';
import { RewardEditorHost } from './Editor';
import { HistoryHost } from './History';
import { RedeemedHost, RewardsView, hideRedeemed } from './RewardsView';
import '../tasks/columns.css';
import '../tasks/tasks.css';
import './rewards.css';

function Controls() {
  return (
    <button
      type="button"
      class={`ctl${hideRedeemed.value ? ' on' : ''}`}
      aria-pressed={hideRedeemed.value}
      onClick={() => (hideRedeemed.value = !hideRedeemed.value)}
    >
      <EyeOff size="1.9rem" /> Hide redeemed
    </button>
  );
}

function Body() {
  return (
    <div class="rw-tab">
      <RewardsView />
      <RewardEditorHost />
      <RedeemedHost />
      <HistoryHost />
    </div>
  );
}

export const rewardsTab: TabDef = {
  id: 'rewards',
  label: 'Rewards',
  icon: Star,
  Controls,
  Body,
  onAdd: () => editReward('new'),
};
