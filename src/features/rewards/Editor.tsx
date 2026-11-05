import { useState } from 'preact/hooks';
import { data, newId, saveEdited } from '../../data/store';
import { EVERYONE, type Reward } from '../../data/types';
import { currentTime } from '../../lib/clock';
import { Button, Chips, Field, Toggle } from '../../ui/controls';
import { Sheet, toast } from '../../ui/overlays';
import { EmojiPicker } from '../../ui/pickers';
import { ProfilePicker } from '../../ui/profile';
import { archiveReward, editingReward } from './actions';
import { MAX_REWARD_COST, validateCost } from './logic';

export function RewardEditorHost() {
  const e = editingReward.value;
  if (!e) return null;
  const reward = e === 'new' ? null : e;
  return <RewardEditor key={reward?.id ?? 'new'} reward={reward} onClose={() => (editingReward.value = null)} />;
}

const COSTS = [10, 20, 50, 100, 250];

function RewardEditor({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  const [title, setTitle] = useState(reward?.title ?? '');
  const [emoji, setEmoji] = useState<string | undefined>(reward?.emoji);
  const [costText, setCostText] = useState(String(reward?.cost ?? 50));
  const [who, setWho] = useState<string[]>(reward?.profiles.length ? reward.profiles : [EVERYONE]);
  const [renews, setRenews] = useState(reward?.renews ?? true);
  const [pickEmoji, setPickEmoji] = useState(!reward);
  const [error, setError] = useState<string | null>(null);
  const cost = costText ? Number(costText) : NaN;

  const save = () => {
    if (!title.trim()) return setError('Give the reward a title.');
    if (who.length === 0) return setError('Choose who can redeem it.');
    const bad = validateCost(cost);
    if (bad) return setError(bad);
    // The stored reward, not the copy the editor opened with: a redemption meanwhile is kept.
    const base = (reward && data.rewards.value.find((r) => r.id === reward.id)) ?? reward;
    const out: Reward = {
      id: reward?.id ?? newId(),
      title: title.trim(),
      emoji,
      cost,
      profiles: who.includes(EVERYONE) ? [] : who,
      renews,
      redeemedBy: base?.redeemedBy ?? {},
      order: reward?.order ?? Math.max(0, ...data.rewards.value.map((r) => r.order)) + 1,
      createdAt: reward?.createdAt ?? currentTime(),
      archived: base?.archived,
    };
    void saveEdited('rewards', out, !reward, ['title', 'emoji', 'cost', 'profiles', 'renews']);
    toast(reward ? `Saved "${out.title}"` : `Added "${out.title}"`);
    onClose();
  };

  return (
    <Sheet
      title={reward ? 'Edit reward' : 'Add reward'}
      onClose={onClose}
      footer={
        <>
          {reward && (
            <Button variant="danger" style={{ marginRight: 'auto' }} onClick={() => archiveReward(reward)}>
              Delete
            </Button>
          )}
          {error && (
            <span class="tk-ed-error" role="alert">
              {error}
            </span>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {reward ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <Field label="Reward">
        <div class="row">
          <button
            type="button"
            class={`tk-ed-emoji${pickEmoji ? ' on' : ''}`}
            aria-label={emoji ? `Emoji ${emoji}, change` : 'Add an emoji'}
            onClick={() => setPickEmoji(!pickEmoji)}
          >
            {emoji ?? '🎁'}
          </button>
          <input
            class="input grow"
            placeholder="e.g. Movie night pick"
            aria-label="Title"
            value={title}
            maxLength={60}
            onInput={(e) => {
              setTitle((e.target as HTMLInputElement).value);
              setError(null);
            }}
          />
        </div>
      </Field>
      {pickEmoji && (
        <div class="tk-ed-picker">
          <EmojiPicker
            value={emoji}
            onChange={(e) => {
              setEmoji(e);
              if (e) setPickEmoji(false);
            }}
          />
        </div>
      )}
      <Field label="Cost">
        <div class="row" style={{ flexWrap: 'wrap' }}>
          <Chips<number>
            value={[cost]}
            options={COSTS.map((n) => ({ value: n, label: `★ ${n}` }))}
            onChange={([n]) => {
              setCostText(String(n));
              setError(null);
            }}
          />
          <input
            class="input"
            style={{ width: '12rem' }}
            inputMode="numeric"
            aria-label="Cost in stars"
            value={costText}
            onInput={(e) => {
              setCostText((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
          />
          <span class="muted">stars, 1 to {MAX_REWARD_COST.toLocaleString()}</span>
        </div>
      </Field>
      <Field label="Who can redeem it">
        <ProfilePicker
          everyone
          value={who}
          onChange={(v) => {
            setWho(v);
            setError(null);
          }}
        />
      </Field>
      <div class="setting-row">
        <div class="label">
          Renews after redeeming
          <small>On: it can be earned again right away. Off: once per person, then it shows as redeemed.</small>
        </div>
        <Toggle label="Renews after redeeming" on={renews} onChange={setRenews} />
      </div>
    </Sheet>
  );
}
