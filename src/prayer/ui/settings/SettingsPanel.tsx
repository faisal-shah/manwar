import { useEffect, useRef, useState } from 'preact/hooks';
import { timezoneNote } from '../../../core/place';
import { settings as household } from '../../../data/store';
import { laterBy } from '../../../lib/date';
import { previewSound, setPreviewVolume, stopPreview } from '../../audio';
import { clockFace } from '../../core/calendar';
import { jumuahLabel, LABELS } from '../../core/labels';
import { MEDIA } from '../../core/media';
import { audioDuration, type AudioUpload } from '../../core/media';
import { PERIOD_NAMES, type ClockState } from '../../core/schedule';
import {
  BG_SLOT_NAMES,
  BG_SLOTS,
  CALC_METHODS,
  CALLIGRAPHY_FONTS,
  DEFAULT_SETTINGS,
  GALLERY_CATEGORIES,
  type GalleryCategory,
  HIGH_LAT_RULES,
  PRAYERS,
  limits,
  type CalligraphyFont,
  type Settings,
  type SoundChoice,
} from '../../core/settings';
import {
  addUpload,
  bundledAudio,
  calligraphyArt,
  chosenBackgrounds,
  clock,
  picking,
  place,
  removeUpload,
  settings,
  setDayTheme,
  settingsOpen,
  upcomingBackgrounds,
  updateSettings,
  uploads,
  viewer,
  type ViewItem,
} from '../../store';
import { T } from '../parts';
import { Row, Segmented, Select, Slider, Stepper, TimeInput, Toggle } from './controls';
import { chooseLocation } from '../nav';
import { PhotoThumb } from './Library';
import { PreviewSection } from './PreviewSection';
import { soundOptions } from '../../recordings';

const SECTIONS = {
  place: 'Location',
  times: 'Prayer times',
  iqamah: "Iqamah & Jumu'ah",
  display: 'Display',
  night: 'Night',
  sound: 'Athan & sound',
  backgrounds: 'Backgrounds',
  preview: 'Preview',
  about: 'About',
} as const;
type Section = keyof typeof SECTIONS;

const set = (patch: (s: Settings) => Partial<Settings>) => updateSettings(patch);

/** The household's place, which the panel opens with (it opens from the clock, which has one). */
function PlaceSection() {
  const p = place.value!;
  const note = timezoneNote(p);
  return (
    <>
      <Row label="This clock is in" hint={`${p.lat.toFixed(4)}, ${p.lon.toFixed(4)} · ${p.timezone}`}>
        <span class="row-value">
          <bdi>{p.name}</bdi>
        </span>
      </Row>
      {note && <p class="panel-warn">{note}</p>}
      <p class="panel-note">The place is the household's, chosen in Settings under Location: the weather is for it too.</p>
      <div class="panel-actions">
        <button class="pf-btn" onClick={chooseLocation}>
          Change location
        </button>
      </div>
    </>
  );
}

function TimesSection() {
  const s = settings.value;
  const st = clock.value;
  return (
    <>
      {st && (
        <div class="times-table">
          {[
            ['Fajr', st.today.fajr],
            ['Sunrise', st.today.sunrise],
            ['Dhuhr', st.today.dhuhr],
            ['Asr', st.today.asr],
            ['Maghrib', st.today.maghrib],
            ['Isha', st.today.isha],
            ['Last third', st.tahajjud],
          ].map(([label, d]) => (
            <div>
              <span>{label as string}</span>
              <T d={d as Date} />
            </div>
          ))}
        </div>
      )}
      <Row label={LABELS.method.label}>
        <Select value={s.method} options={CALC_METHODS} onChange={(method) => set(() => ({ method }))} />
      </Row>
      <Row label={LABELS.madhab.label} hint={LABELS.madhab.hint}>
        <Segmented value={s.madhab} options={LABELS.madhab.options} onChange={(madhab) => set(() => ({ madhab }))} />
      </Row>
      <Row label={LABELS.highLatRule.label} hint={LABELS.highLatRule.hint}>
        <Select value={s.highLatRule} options={HIGH_LAT_RULES} onChange={(highLatRule) => set(() => ({ highLatRule }))} />
      </Row>
      <div class="panel-sub">{LABELS.adjust.label}</div>
      {PRAYERS.map((p) => (
        <Row label={PERIOD_NAMES[p]}>
          <Stepper
            value={s.adjust[p]}
            {...limits('adjust.*')}
            unit={LABELS.adjust.unit}
            signed
            onChange={(v) => set((x) => ({ adjust: { ...x.adjust, [p]: v } }))}
          />
        </Row>
      ))}
    </>
  );
}

function IqamahSection() {
  const s = settings.value;
  const times = s.jumuah.times;
  const setTimes = (t: string[]) => set((x) => ({ jumuah: { ...x.jumuah, times: t } }));
  return (
    <>
      <div class="panel-sub">{LABELS.iqamah.label}</div>
      {PRAYERS.map((p) => (
        <Row label={PERIOD_NAMES[p]}>
          <Stepper
            value={s.iqamah[p]}
            {...limits('iqamah.*')}
            unit={LABELS.iqamah.unit}
            onChange={(v) => set((x) => ({ iqamah: { ...x.iqamah, [p]: v } }))}
          />
        </Row>
      ))}
      <div class="panel-sub">Jumu'ah</div>
      <Row label={LABELS.jumuah.label} hint={LABELS.jumuah.hint}>
        <Toggle value={s.jumuah.enabled} onChange={(enabled) => set((x) => ({ jumuah: { ...x.jumuah, enabled } }))} />
      </Row>
      {s.jumuah.enabled && (
        <>
          {times.map((t, i) => (
            <Row label={jumuahLabel(i, times.length)}>
              <div class="inline">
                <TimeInput value={t} onChange={(v) => setTimes(times.map((x, j) => (j === i ? v : x)).sort())} />
                {times.length > 1 && (
                  <button class="pf-btn pf-small" onClick={() => setTimes(times.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
              </div>
            </Row>
          ))}
          {times.length < 2 && (
            <div class="panel-actions">
              <button class="pf-btn" onClick={() => setTimes([...times, laterBy(times[0] ?? '13:30', 60)].sort())}>
                {LABELS.addJumuah.label}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** What is covering the daytime theme right now, if anything. */
function themeNote(st: ClockState, s: Settings): string {
  if (!st.themeUntil || st.theme === s.dayTheme) return 'Shown outside the calligraphy window and the night hours.';
  const f = clockFace(st.themeUntil, household.value.timeFormat);
  const until = f.ampm ? `${f.hm}\u00a0${f.ampm}` : f.hm;
  if (st.theme === 'night') return `The night theme is on until ${until}, then this one.`;
  return `Calligraphy is on after the ${PERIOD_NAMES[st.current.name]} athan until ${until}. Choosing a theme here ends it now.`;
}

function DisplaySection() {
  const s = settings.value;
  const hasArt = calligraphyArt.value.length > 0;
  return (
    <>
      <Row label="Daytime theme" hint={themeNote(clock.value!, s)}>
        <Segmented
          value={s.dayTheme}
          options={[
            ['calligraphy', 'Calligraphy'],
            ['classic', 'Classic'],
            ['kids', 'Kids'],
            ['gallery', 'Gallery'],
          ]}
          onChange={setDayTheme}
        />
      </Row>
      {s.dayTheme === 'gallery' && (
        <>
          <Row label="Change the photo every">
            <Stepper
              value={s.gallery.minutes}
              {...limits('gallery.minutes')}
              unit="min"
              onChange={(minutes) => set((x) => ({ gallery: { ...x.gallery, minutes } }))}
            />
          </Row>
          {(Object.keys(GALLERY_CATEGORIES) as GalleryCategory[]).map((c) => (
            <Row label={GALLERY_CATEGORIES[c]}>
              <Toggle
                value={s.gallery.categories[c]}
                onChange={(v) => set((x) => ({ gallery: { ...x.gallery, categories: { ...x.gallery.categories, [c]: v } } }))}
              />
            </Row>
          ))}
        </>
      )}
      <Row label="Calligraphy after each athan" hint="How long the calligraphy theme stays after the athan.">
        <Stepper
          value={s.calligraphyMinutes}
          {...limits('calligraphyMinutes')}
          step={5}
          unit="min"
          onChange={(calligraphyMinutes) => set(() => ({ calligraphyMinutes }))}
        />
      </Row>
      <Row label="Calligraphy style">
        <Segmented
          value={s.calligraphyFont === 'art' && !hasArt ? 'ruqaa' : s.calligraphyFont}
          options={(Object.entries(CALLIGRAPHY_FONTS) as [CalligraphyFont, string][]).filter(([k]) => hasArt || k !== 'art')}
          onChange={(calligraphyFont) => set(() => ({ calligraphyFont }))}
        />
      </Row>
      <Row label={LABELS.hijriOffset.label} hint={LABELS.hijriOffset.hint}>
        <Stepper
          value={s.hijriOffset}
          {...limits('hijriOffset')}
          unit={LABELS.hijriOffset.unit}
          signed
          onChange={(hijriOffset) => set(() => ({ hijriOffset }))}
        />
      </Row>
      <Row label={LABELS.ramadan.label} hint={LABELS.ramadan.hint}>
        <Segmented value={s.ramadan} options={LABELS.ramadan.options} onChange={(ramadan) => set(() => ({ ramadan }))} />
      </Row>
      <Row label="Weather" hint="At the household's place, in the unit chosen in Settings, under Location.">
        <Toggle value={s.showWeather} onChange={(showWeather) => set(() => ({ showWeather }))} />
      </Row>
      <Row label="Verse, hadith and dua of the day">
        <Toggle value={s.showDaily} onChange={(showDaily) => set(() => ({ showDaily }))} />
      </Row>
      <Row label="Makruh-time notice" hint="During sunrise, zenith and sunset.">
        <Toggle value={s.makruhBadge} onChange={(makruhBadge) => set(() => ({ makruhBadge }))} />
      </Row>
      <Row label="Motion" hint="Calm stops the slow zoom, light rays and drifting clouds (for slower tablets).">
        <Segmented
          value={s.motion}
          options={[
            ['full', 'Full'],
            ['calm', 'Calm'],
          ]}
          onChange={(motion) => set(() => ({ motion }))}
        />
      </Row>
      <Row label="Name" hint="Shown at the foot of the classic theme.">
        <input
          class="text-input"
          value={s.title}
          maxLength={40}
          onInput={(e) => set(() => ({ title: (e.target as HTMLInputElement).value }))}
        />
      </Row>
    </>
  );
}

function NightSection() {
  const s = settings.value;
  const n = s.night;
  const setNight = (patch: Partial<Settings['night']>) => set((x) => ({ night: { ...x.night, ...patch } }));
  return (
    <>
      <Row label="Night theme" hint="A dim, low-glare clock while the house sleeps.">
        <Toggle value={n.enabled} onChange={(enabled) => setNight({ enabled })} />
      </Row>
      {n.enabled && (
        <>
          <Row label="Starts after Isha">
            <Stepper
              value={n.startAfterIsha}
              {...limits('night.startAfterIsha')}
              step={15}
              unit="min"
              onChange={(startAfterIsha) => setNight({ startAfterIsha })}
            />
          </Row>
          <Row label="Ends before Fajr" hint="0 keeps it dark until the Fajr athan.">
            <Stepper
              value={n.endBeforeFajr}
              {...limits('night.endBeforeFajr')}
              step={5}
              unit="min"
              onChange={(endBeforeFajr) => setNight({ endBeforeFajr })}
            />
          </Row>
        </>
      )}
      <p class="panel-note">The wall's own Settings, under Display, dim and sleep the screen at night.</p>
    </>
  );
}

function SoundPicker({
  choice,
  kind,
  onChange,
}: {
  choice: SoundChoice;
  kind: 'athan' | 'fajr';
  onChange: (c: SoundChoice) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  // This tablet's own uploads: it can play no other tablet's.
  const opts = soundOptions(
    bundledAudio.value,
    uploads.value.flatMap((u) => (u.kind === 'audio' ? [u] : [])),
    kind,
    (name) => `Uploaded: ${name}`,
  );
  // Chosen on another tablet or a phone from another tablet's uploads: this one plays the default athan.
  if (!opts.some(([id]) => id === choice.audioId))
    opts.unshift([choice.audioId, choice.audioId.startsWith('upload:') ? 'Uploaded on another tablet' : choice.audioId]);
  return (
    <div class="sound">
      <Toggle value={choice.enabled} onChange={(enabled) => onChange({ ...choice, enabled })} />
      {choice.enabled && (
        <>
          <Select value={choice.audioId} options={opts} onChange={(audioId) => onChange({ ...choice, audioId })} />
          <Slider
            value={choice.volume}
            onChange={(volume) => {
              if (playing) setPreviewVolume(volume);
              onChange({ ...choice, volume });
            }}
          />
          <button
            class="pf-btn pf-small"
            onClick={() => {
              if (playing) {
                stopRef.current?.();
                setPlaying(false);
              } else {
                stopRef.current = previewSound(choice.audioId, choice.volume);
                setPlaying(stopRef.current !== null);
              }
            }}
          >
            {playing ? 'Stop' : 'Play'}
          </button>
        </>
      )}
    </div>
  );
}

function SoundSection() {
  const s = settings.value;
  const [error, setError] = useState('');
  const seq = s.sequence;
  const setSeq = (patch: Partial<Settings['sequence']>) => set((x) => ({ sequence: { ...x.sequence, ...patch } }));
  return (
    <>
      <div class="panel-sub">{LABELS.atEachPrayer.label}</div>
      <Row label={LABELS.preCountdown.label}>
        <Toggle value={seq.preCountdown} onChange={(preCountdown) => setSeq({ preCountdown })} />
      </Row>
      <Row label={LABELS.dua.label}>
        <Toggle value={seq.dua} onChange={(dua) => setSeq({ dua })} />
      </Row>
      <Row label={LABELS.iqamahCountdown.label} hint={LABELS.iqamahCountdown.hint}>
        <Toggle value={seq.iqamahCountdown} onChange={(iqamahCountdown) => setSeq({ iqamahCountdown })} />
      </Row>
      <Row label={LABELS.chime.label}>
        <div class="sound">
          <Toggle value={s.chime.enabled} onChange={(enabled) => set((x) => ({ chime: { ...x.chime, enabled } }))} />
          {s.chime.enabled && (
            <Slider value={s.chime.volume} onChange={(volume) => set((x) => ({ chime: { ...x.chime, volume } }))} />
          )}
        </div>
      </Row>
      <div class="panel-sub">Athan</div>
      {PRAYERS.map((p) => (
        <Row label={PERIOD_NAMES[p]}>
          <SoundPicker
            choice={s.sounds[p]}
            kind={p === 'fajr' ? 'fajr' : 'athan'}
            onChange={(c) => set((x) => ({ sounds: { ...x.sounds, [p]: c } }))}
          />
        </Row>
      ))}
      <Row label={LABELS.tahajjud.label} hint={LABELS.tahajjud.hint}>
        <SoundPicker choice={s.tahajjud} kind="athan" onChange={(tahajjud) => set(() => ({ tahajjud }))} />
      </Row>
      <div class="panel-sub">Your recordings</div>
      {uploads.value
        .filter((u) => u.kind === 'audio')
        .map((u) => (
          <Row label={u.name} hint={u.kind === 'audio' && u.durationSec ? `${Math.round(u.durationSec)} s` : undefined}>
            <button class="pf-btn pf-small" onClick={() => removeUpload(u.id)}>
              Delete
            </button>
          </Row>
        ))}
      <div class="panel-actions">
        <label class="pf-btn">
          Upload an athan (MP3, M4A, OGG)
          <input
            type="file"
            accept="audio/*"
            hidden
            onChange={async (e) => {
              const input = e.target as HTMLInputElement;
              const file = input.files?.[0];
              input.value = '';
              if (!file) return;
              setError('');
              try {
                const durationSec = await audioDuration(file);
                await addUpload<AudioUpload>({ kind: 'audio', name: file.name.replace(/\.[^.]+$/, ''), durationSec, blob: file });
              } catch (err) {
                setError(String((err as Error).message ?? err));
              }
            }}
          />
        </label>
      </div>
      {error && <div class="panel-error">{error}</div>}
    </>
  );
}

function BackgroundsSection() {
  const day = clock.value?.now ?? new Date();
  return (
    <>
      <p class="panel-note">
        Each part of the day has a set of photos for the calligraphy theme and the athan screen, and shows a different one each
        day. Choose any photos from the gallery, or add your own.
      </p>
      {BG_SLOTS.map((slot) => {
        // Today's photo first, then the days after it.
        const set = upcomingBackgrounds(slot, day);
        const choice = settings.value.backgrounds[slot];
        const items: ViewItem[] = set.map((photo) => ({ kind: 'background', photo, slot }));
        return (
          <div class="bg-slot">
            <div class="bg-slot-head">
              <div>
                <div class="bg-slot-name">{BG_SLOT_NAMES[slot]}</div>
                <div class="bg-slot-count">
                  {choice === 'all' ? 'All ' : ''}
                  {set.length} {set.length === 1 ? 'photo' : 'photos'}
                  {choice === null || !chosenBackgrounds(slot).length ? ' · suggested' : ''}
                </div>
              </div>
              <button class="pf-btn pf-small" onClick={() => (picking.value = slot)}>
                Choose photos
              </button>
            </div>
            <div class="bg-thumbs">
              {set.map((p, i) => (
                <button
                  class={`bg-thumb ${i === 0 ? 'showing' : ''}`}
                  aria-label={`Preview ${p.title}`}
                  onClick={() => (viewer.value = { items, index: i })}
                >
                  <PhotoThumb photo={p} />
                  {i === 0 && <span class="bg-today">Today</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function AboutSection() {
  return (
    <>
      <p class="panel-note">
        Prayer times are calculated on this tablet. These settings are the household's: a paired phone changes them too, in More,
        then Prayer times. Uploaded photos and recordings stay on this tablet.
      </p>
      <div class="panel-actions">
        <button
          class="pf-btn"
          onClick={() => {
            if (confirm('Reset all prayer settings? The location, uploaded photos and recordings are kept.')) {
              updateSettings(() => DEFAULT_SETTINGS);
            }
          }}
        >
          Reset settings
        </button>
      </div>
      <div class="panel-sub">Sources</div>
      <p class="panel-note">
        Quran text from{' '}
        <a href="https://tanzil.net" target="_blank" rel="noreferrer">
          Tanzil.net
        </a>{' '}
        (Uthmani), English translation Saheeh International. Hadith from the hadith-api collection, numbered as on sunnah.com;
        only sahih and hasan narrations. Prayer times by adhan-js. Weather by Open-Meteo. Photo and recording credits:{' '}
        <a href={`${MEDIA}/gallery/CREDITS.md`} target="_blank" rel="noreferrer">
          photos
        </a>
        ,{' '}
        <a href={`${MEDIA}/audio/CREDITS.md`} target="_blank" rel="noreferrer">
          athans
        </a>
        .
      </p>
    </>
  );
}

const RENDER: Record<Section, () => preact.JSX.Element | null> = {
  place: PlaceSection,
  times: TimesSection,
  iqamah: IqamahSection,
  display: DisplaySection,
  night: NightSection,
  sound: SoundSection,
  backgrounds: BackgroundsSection,
  preview: () => (clock.value ? <PreviewSection st={clock.value} /> : null),
  about: AboutSection,
};

export function SettingsPanel() {
  const [section, setSection] = useState<Section>('display');
  const Body = RENDER[section];
  const close = () => {
    stopPreview();
    picking.value = null;
    settingsOpen.value = false;
  };
  return (
    <div class="pf-settings" inert={picking.value !== null} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="panel">
        <nav class="panel-nav">
          <div class="panel-title">Settings</div>
          {(Object.keys(SECTIONS) as Section[]).map((k) => (
            <button class={k === section ? 'on' : ''} onClick={() => setSection(k)}>
              {SECTIONS[k]}
            </button>
          ))}
        </nav>
        <div class="panel-body">
          <div class="panel-head">
            <h2>{SECTIONS[section]}</h2>
            <button class="panel-close" aria-label="Close settings" onClick={close}>
              ×
            </button>
          </div>
          <Body />
        </div>
      </div>
    </div>
  );
}
