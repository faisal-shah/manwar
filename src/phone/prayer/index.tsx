import './prayer.css';
import { computed, signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import { MapPin, Play, Square } from 'lucide-preact';
import { prayerSettingsDoc, settings as wallSettings } from '../../data/store';
import { nowMs } from '../../lib/clock';
import { locateDevice, searchPlaces } from '../../prayer/core/geo';
import { loadBundledAudio, MEDIA, type BundledAudio } from '../../prayer/core/media';
import { PERIOD_NAMES } from '../../prayer/core/schedule';
import {
  CALC_METHODS,
  HIGH_LAT_RULES,
  HHMM,
  PRAYERS,
  RANGES,
  type Place,
  type Settings,
  type SoundChoice,
} from '../../prayer/core/settings';
import { listedRecordings, soundOptions } from '../../prayer/recordings';
import { settings, updateSettings } from '../../prayer/settingsStore';
import { Button, Segmented, SettingRow, Stepper, Toggle } from '../../ui/controls';
import { MosqueIcon } from '../../ui/MosqueIcon';
import type { MoreItem } from '../more/items';
import { moreView } from '../more/view';
import { goPhone } from '../nav';
import { swallowRestOfTap } from '../../ui/overlays';
import { nextLine, placeTime, prayerDay, slotName } from './logic';

const set = (patch: (s: Settings) => Partial<Settings>) => updateSettings(patch);
const range = (path: keyof typeof RANGES) => ({ min: RANGES[path][0], max: RANGES[path][1] });

/** The clock to the minute: the next prayer changes only on one (athans fall on whole minutes). */
const minute = computed(() => Math.floor(nowMs.value / 60_000));

/** Today's prayers and the next one, for the household's place (null before it has one). */
export const prayerNow = computed(() => prayerDay(new Date(minute.value * 60_000 + 1), settings.value));

/** More > Prayer times, from another tab (Today's prayer line). */
export function openPrayerTimes(): void {
  swallowRestOfTap();
  goPhone('more');
  moreView.value = 'prayer';
}

/** The bundled recordings (public/prayer/audio/index.json), loaded when the view first opens. */
const bundled = signal<BundledAudio[]>([]);
let bundledAsked = false;

/**
 * More > Prayer times: the household's prayer clock settings (the same
 * document the wall's prayer face edits): the place, how the times are
 * calculated, iqamah and Jumu'ah, and each athan's sound. The wall's look
 * (themes, photos, the night clock) is set on the wall.
 */
function PrayerTimes() {
  const s = settings.value;
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    if (bundledAsked) return;
    bundledAsked = true;
    loadBundledAudio().then(
      (list) => (bundled.value = list),
      () => (bundledAsked = false),
    );
  }, []);
  if (!s.place || changing)
    return (
      <div class="ph-stack">
        <PlacePicker
          onPick={(place) => {
            set(() => ({ place }));
            setChanging(false);
          }}
          onCancel={s.place ? () => setChanging(false) : undefined}
        />
      </div>
    );
  return (
    <div class="ph-stack ppt">
      <Today place={s.place} onChange={() => setChanging(true)} />
      <Calculation s={s} />
      <Iqamah s={s} />
      <Sounds s={s} />
      <section class="ph-card" aria-label="Calendar">
        <h2 class="ph-card-title">Islamic calendar</h2>
        <SettingRow label="Ramadan" hint="Suhoor and iftar countdowns and the iftar dua.">
          <Segmented
            value={s.ramadan}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            onChange={(ramadan) => set(() => ({ ramadan }))}
          />
        </SettingRow>
        <SettingRow label="Hijri date adjustment" hint="Days, to match the local moonsighting.">
          <Stepper value={s.hijriOffset} {...range('hijriOffset')} onChange={(hijriOffset) => set(() => ({ hijriOffset }))} />
        </SettingRow>
      </section>
      <p class="muted ppt-note">
        How the wall looks (its themes, photos and the night clock) is set on the wall: the gear on its prayer screen.
      </p>
    </div>
  );
}

function Today({ place, onChange }: { place: Place; onChange: () => void }) {
  const fmt = wallSettings.value.timeFormat;
  const day = prayerNow.value;
  return (
    <section class="ph-card" aria-label="Today's prayer times">
      <div class="ppt-head">
        <h2 class="ph-card-title" dir="auto">
          {place.name}
        </h2>
        <Button small onClick={onChange}>
          Change
        </Button>
      </div>
      {day && (
        <ul class="ppt-times">
          {day.slots.map((slot) => (
            <li key={slot.id} class={slot.id === day.next.id ? 'next' : ''}>
              <span class="ppt-name">{slotName(slot)}</span>
              <span>{placeTime(slot.athan, place, fmt)}</span>
              <span class="muted">iqamah {placeTime(slot.iqamah, place, fmt)}</span>
            </li>
          ))}
        </ul>
      )}
      {day && !day.slots.some((x) => x.id === day.next.id) && <p class="muted">Next: {nextLine(day.next, place, fmt)}</p>}
    </section>
  );
}

function Calculation({ s }: { s: Settings }) {
  return (
    <section class="ph-card" aria-label="Calculation">
      <h2 class="ph-card-title">Calculation</h2>
      <SettingRow label="Calculation method">
        <Select
          label="Calculation method"
          value={s.method}
          options={Object.entries(CALC_METHODS)}
          onChange={(method) => set(() => ({ method: method as Settings['method'] }))}
        />
      </SettingRow>
      <SettingRow label="Asr" hint="Hanafi: shadow twice an object's length. Standard: Shafi'i, Maliki, Hanbali.">
        <Segmented
          value={s.madhab}
          options={[
            { value: 'hanafi', label: 'Hanafi' },
            { value: 'shafi', label: 'Standard' },
          ]}
          onChange={(madhab) => set(() => ({ madhab }))}
        />
      </SettingRow>
      <SettingRow label="High-latitude rule" hint="How Fajr and Isha are found when twilight never fully ends.">
        <Select
          label="High-latitude rule"
          value={s.highLatRule}
          options={Object.entries(HIGH_LAT_RULES)}
          onChange={(highLatRule) => set(() => ({ highLatRule: highLatRule as Settings['highLatRule'] }))}
        />
      </SettingRow>
      <h3 class="ppt-sub">Adjust calculated athan times, minutes</h3>
      {PRAYERS.map((p) => (
        <SettingRow key={p} label={PERIOD_NAMES[p]}>
          <Stepper
            value={s.adjust[p]}
            {...range('adjust.*')}
            onChange={(v) => set((x) => ({ adjust: { ...x.adjust, [p]: v } }))}
          />
        </SettingRow>
      ))}
    </section>
  );
}

function Iqamah({ s }: { s: Settings }) {
  const times = s.jumuah.times;
  const setTimes = (t: string[]) => set((x) => ({ jumuah: { ...x.jumuah, times: [...t].sort() } }));
  return (
    <section class="ph-card" aria-label="Iqamah">
      <h2 class="ph-card-title">Iqamah and Jumu'ah</h2>
      <h3 class="ppt-sub">Iqamah, minutes after athan</h3>
      {PRAYERS.map((p) => (
        <SettingRow key={p} label={PERIOD_NAMES[p]}>
          <Stepper
            value={s.iqamah[p]}
            {...range('iqamah.*')}
            onChange={(v) => set((x) => ({ iqamah: { ...x.iqamah, [p]: v } }))}
          />
        </SettingRow>
      ))}
      <SettingRow label="Show Jumu'ah" hint="On Fridays Dhuhr becomes Jumu'ah and its iqamah is the first Jumu'ah time.">
        <Toggle
          label="Show Jumu'ah"
          on={s.jumuah.enabled}
          onChange={(enabled) => set((x) => ({ jumuah: { ...x.jumuah, enabled } }))}
        />
      </SettingRow>
      {s.jumuah.enabled &&
        times.map((t, i) => (
          <SettingRow key={`${i}-${t}`} label={times.length > 1 ? `Jumu'ah ${i + 1}` : "Jumu'ah"}>
            <div class="ppt-inline">
              <TimeField
                label={times.length > 1 ? `Jumu'ah ${i + 1} time` : "Jumu'ah time"}
                value={t}
                onChange={(v) => setTimes(times.map((x, j) => (j === i ? v : x)))}
              />
              {times.length > 1 && (
                <Button small onClick={() => setTimes(times.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              )}
            </div>
          </SettingRow>
        ))}
      {s.jumuah.enabled && times.length < 2 && (
        <Button small onClick={() => setTimes([...times, laterBy(times[0] ?? '13:30', 60)])}>
          Add a second Jumu'ah
        </Button>
      )}
    </section>
  );
}

/** "13:30" an hour later, within the day. */
function laterBy(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function Sounds({ s }: { s: Settings }) {
  const seq = s.sequence;
  const setSeq = (patch: Partial<Settings['sequence']>) => set((x) => ({ sequence: { ...x.sequence, ...patch } }));
  return (
    <section class="ph-card" aria-label="Athan and sound">
      <h2 class="ph-card-title">Athan and sound</h2>
      {PRAYERS.map((p) => (
        <SoundRow
          key={p}
          label={PERIOD_NAMES[p]}
          kind={p === 'fajr' ? 'fajr' : 'athan'}
          choice={s.sounds[p]}
          onChange={(c) => set((x) => ({ sounds: { ...x.sounds, [p]: c } }))}
        />
      ))}
      <SoundRow
        label="Tahajjud"
        hint="An athan at the start of the last third of the night."
        kind="athan"
        choice={s.tahajjud}
        onChange={(tahajjud) => set(() => ({ tahajjud }))}
      />
      <h3 class="ppt-sub">At each prayer</h3>
      <SettingRow label="One-minute countdown before the athan">
        <Toggle label="Countdown before the athan" on={seq.preCountdown} onChange={(preCountdown) => setSeq({ preCountdown })} />
      </SettingRow>
      <SettingRow label="Chime before the athan">
        <Toggle
          label="Chime before the athan"
          on={s.chime.enabled}
          onChange={(enabled) => set((x) => ({ chime: { ...x.chime, enabled } }))}
        />
      </SettingRow>
      {s.chime.enabled && (
        <Volume
          label="Chime volume"
          value={s.chime.volume}
          onChange={(volume) => set((x) => ({ chime: { ...x.chime, volume } }))}
        />
      )}
      <SettingRow label="Dua after the athan">
        <Toggle label="Dua after the athan" on={seq.dua} onChange={(dua) => setSeq({ dua })} />
      </SettingRow>
      <SettingRow label="Full-screen iqamah countdown" hint="The last minute before iqamah.">
        <Toggle label="Iqamah countdown" on={seq.iqamahCountdown} onChange={(iqamahCountdown) => setSeq({ iqamahCountdown })} />
      </SettingRow>
    </section>
  );
}

/** The recording a phone is playing to try it (one at a time), or null. */
const trying = signal<string | null>(null);
let tryEl: HTMLAudioElement | null = null;

function tryRecording(audioId: string | null): void {
  tryEl?.pause();
  trying.value = null;
  const a = audioId && bundled.peek().find((x) => x.id === audioId);
  if (!a) return;
  tryEl = new Audio(`${MEDIA}/audio/${a.file}`);
  tryEl.addEventListener('ended', () => (trying.value = null));
  trying.value = audioId;
  tryEl.play().catch(() => (trying.value = null));
}

function SoundRow({
  label,
  hint,
  kind,
  choice,
  onChange,
}: {
  label: string;
  hint?: string;
  kind: 'athan' | 'fajr';
  choice: SoundChoice;
  onChange: (c: SoundChoice) => void;
}) {
  const uploads = listedRecordings(prayerSettingsDoc.value);
  const opts = soundOptions(bundled.value, uploads, kind, (name) => `Uploaded on the wall: ${name}`);
  // A choice not in the list yet (the bundled index loading, an upload another tablet removed) still shows.
  if (!opts.some(([id]) => id === choice.audioId))
    opts.unshift([choice.audioId, choice.audioId.startsWith('upload:') ? 'Uploaded on a wall' : '…']);
  const playable = bundled.value.some((a) => a.id === choice.audioId);
  const playing = trying.value === choice.audioId;
  useEffect(() => () => void (trying.peek() && tryRecording(null)), []);
  return (
    <div class="ppt-sound">
      <SettingRow label={label} hint={hint}>
        <Toggle label={`${label} athan`} on={choice.enabled} onChange={(enabled) => onChange({ ...choice, enabled })} />
      </SettingRow>
      {choice.enabled && (
        <>
          <div class="ppt-inline">
            <Select
              label={`${label} recording`}
              value={choice.audioId}
              options={opts}
              onChange={(audioId) => onChange({ ...choice, audioId })}
            />
            {playable && (
              <button
                type="button"
                class="ctl ctl-round"
                aria-label={playing ? `Stop ${label} recording` : `Play ${label} recording`}
                onClick={() => tryRecording(playing ? null : choice.audioId)}
              >
                {playing ? <Square size="1.8rem" /> : <Play size="1.8rem" />}
              </button>
            )}
          </div>
          <Volume label={`${label} volume`} value={choice.volume} onChange={(volume) => onChange({ ...choice, volume })} />
        </>
      )}
    </div>
  );
}

/** A volume (0..1) as a slider in steps of 5 %. */
function Volume({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label class="ppt-volume">
      <span class="muted">Volume on the wall</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label={label}
        value={Math.round(value * 100)}
        onChange={(e: TargetedEvent<HTMLInputElement>) => onChange(Number(e.currentTarget.value) / 100)}
      />
      <span class="ppt-volume-n">{Math.round(value * 100)}%</span>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <select class="input ppt-select" aria-label={label} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** A 24-hour "HH:MM" field; a time typed only half way is not saved. */
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      class="input ppt-time"
      aria-label={label}
      value={value}
      onChange={(e: TargetedEvent<HTMLInputElement>) => {
        const v = e.currentTarget.value;
        if (HHMM.test(v)) onChange(v);
      }}
    />
  );
}

/** Where the family lives: searched by name, or this phone's location. */
function PlacePicker({ onPick, onCancel }: { onPick: (p: Place) => void; onCancel?: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError((e as Error).message || 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="ph-card ppt-place" aria-label="Place">
      <h2 class="ph-card-title">
        <MosqueIcon size="2.4rem" strokeWidth={1.8} /> Where the family lives
      </h2>
      <p class="muted">The wall calculates the prayer times for this place.</p>
      <Button onClick={() => void run(async () => onPick(await locateDevice()))} disabled={busy}>
        <MapPin size="2rem" /> Use this phone's location
      </Button>
      <form
        class="ppt-search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => setResults(await searchPlaces(query)));
        }}
      >
        <input
          class="input"
          aria-label="City"
          placeholder="Or search for a city"
          value={query}
          onInput={(e: TargetedEvent<HTMLInputElement>) => setQuery(e.currentTarget.value)}
        />
        <Button type="submit" disabled={busy || query.trim().length < 2}>
          Search
        </Button>
      </form>
      {error && <p class="error">{error}</p>}
      {results && results.length === 0 && <p class="muted">No places found.</p>}
      {results && results.length > 0 && (
        <ul class="ppt-results">
          {results.map((p) => (
            <li key={`${p.latitude},${p.longitude}`}>
              <button type="button" onClick={() => onPick(p)}>
                <span dir="auto">{p.name}</span>
                <small class="muted">{p.timezone ?? `${p.latitude.toFixed(2)}, ${p.longitude.toFixed(2)}`}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {onCancel && (
        <Button small onClick={onCancel}>
          Cancel
        </Button>
      )}
    </section>
  );
}

export const prayerItem: MoreItem = {
  id: 'prayer',
  label: 'Prayer times',
  icon: MosqueIcon,
  hint: () => {
    const s = settings.value;
    if (!s.place) return 'Set where the family lives';
    const day = prayerNow.value;
    return day ? `Next: ${nextLine(day.next, s.place, wallSettings.value.timeFormat)}` : null;
  },
  View: PrayerTimes,
};
