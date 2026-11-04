import { useState } from 'preact/hooks';
import type { ISODate, Repeat, RepeatUnit, Weekday } from '../data/types';
import { dayShort, weekdayOf } from '../lib/date';
import { describeRepeat } from '../lib/repeat';
import { Chips, Segmented, Stepper, Toggle } from './controls';

/** Profile colors offered by Skylight's profile editor (research/04, sampled swatches). */
export const PROFILE_COLORS = [
  '#CB434C',
  '#F66850',
  '#FBA894',
  '#CE632D',
  '#F2B074',
  '#FEB306',
  '#FBD97F',
  '#CE822E',
  '#408157',
  '#B5E085',
  '#2D7F86',
  '#82D7DC',
  '#A8D4D3',
  '#2177AE',
  '#93D1E5',
  '#00526C',
  '#7E5BA6',
  '#C7A9D4',
];

export function ColorSwatches({
  value,
  onChange,
  colors = PROFILE_COLORS,
}: {
  value: string;
  onChange: (c: string) => void;
  colors?: string[];
}) {
  return (
    <div class="swatches">
      {colors.map((c) => (
        <button
          type="button"
          aria-label={c}
          class={c.toLowerCase() === value.toLowerCase() ? 'on' : ''}
          style={{ '--c': c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

const EMOJI_GROUPS: Record<string, string> = {
  Routines: '☀️🌤️🌙⭐🛏️🪥🦷🧼🚿🛁🧴💧🧻🚽👕👖🧦👟🎒📚📖✏️📝🧮🔬🎨🎹🎻🎸⚽🏀🏊🚴🧘🤲🕌📿🙏',
  Chores: '🧹🧺🧽🗑️♻️🍽️🥣🧸🛒🐶🐱🐟🌱🪴🚗🧾📦🪣🧯🔧',
  Food: '🍳🥞🥯🥐🍞🥪🌮🌯🍕🍝🍜🍲🍛🍚🥗🍗🍖🐟🍤🥘🍔🍟🌭🥚🧀🥦🥕🌽🍎🍌🍇🍓🍊🍉🥝🍐🥑🍪🍰🧁🍦🍫🍿🥤☕🍵🥛🧃',
  Events: '🎂🎉🎈🎁🏥🦷🩺💉✈️🚌🚆🏕️🏖️🎬🎟️🏫🏢🛍️💇📞💻🧑‍🏫👪❤️',
};

/** Curated emoji grid (with a field for anything else). */
export function EmojiPicker({ value, onChange }: { value?: string; onChange: (e: string | undefined) => void }) {
  const [group, setGroup] = useState(Object.keys(EMOJI_GROUPS)[0]);
  const list = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(EMOJI_GROUPS[group])].map((s) => s.segment);
  return (
    <div>
      <div class="row" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Segmented value={group} options={Object.keys(EMOJI_GROUPS).map((g) => ({ value: g, label: g }))} onChange={setGroup} />
        <input
          class="input"
          style={{ width: '9rem', textAlign: 'center', fontSize: '2.6rem' }}
          aria-label="Type an emoji"
          value={value ?? ''}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value.trim();
            const first = v
              ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(v)].at(-1)!.segment
              : undefined;
            onChange(first);
          }}
        />
        {value && (
          <button type="button" class="btn btn-sm btn-ghost" onClick={() => onChange(undefined)}>
            No emoji
          </button>
        )}
      </div>
      <div class="emoji-grid scroll">
        {list.map((e) => (
          <button type="button" class={e === value ? 'on' : ''} onClick={() => onChange(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

const UNITS: { value: RepeatUnit | 'none'; label: string }[] = [
  { value: 'none', label: 'Never' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

/**
 * Repeat rule editor shared by events, chores, routines and meals:
 * Never / Daily / Weekly (weekday chips) / Monthly / Yearly, every N, until.
 * `units` limits the choices (routines: day and week only).
 */
export function RepeatEditor({
  value,
  start,
  onChange,
  units = ['none', 'day', 'week', 'month', 'year'],
}: {
  value: Repeat | undefined;
  start: ISODate;
  onChange: (r: Repeat | undefined) => void;
  units?: (RepeatUnit | 'none')[];
}) {
  const unit = value?.unit ?? 'none';
  const set = (patch: Partial<Repeat>) => onChange({ every: 1, unit: 'day', ...value, ...patch });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
      <Segmented
        value={unit}
        options={UNITS.filter((u) => units.includes(u.value))}
        onChange={(u) =>
          u === 'none'
            ? onChange(undefined)
            : onChange({ every: 1, unit: u, weekdays: u === 'week' ? [weekdayOf(start)] : undefined, until: value?.until })
        }
      />
      {value && (
        <>
          <div class="row">
            <span class="muted">Every</span>
            <Stepper value={value.every} min={1} max={30} onChange={(every) => set({ every })} />
            <span class="muted">{value.unit + (value.every === 1 ? '' : 's')}</span>
          </div>
          {value.unit === 'week' && (
            <Chips<Weekday>
              multi
              value={value.weekdays ?? [weekdayOf(start)]}
              options={([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => ({ value: d, label: dayShort(d) }))}
              onChange={(weekdays) => weekdays.length && set({ weekdays: weekdays.sort() })}
            />
          )}
          <div class="row">
            <Toggle label="Repeats until" on={!!value.until} onChange={(on) => set({ until: on ? start : undefined })} />
            <span>Ends</span>
            {value.until && (
              <input
                class="input"
                type="date"
                style={{ width: 'auto' }}
                value={value.until}
                min={start}
                onInput={(e) => set({ until: (e.target as HTMLInputElement).value || undefined })}
              />
            )}
          </div>
          <span class="muted">{describeRepeat(value, start)}</span>
        </>
      )}
    </div>
  );
}
