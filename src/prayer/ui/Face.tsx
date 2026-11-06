import '@fontsource/noto-serif-display/latin-400.css';
import '@fontsource/marcellus/latin-400.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/playfair-display/latin-900.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/aref-ruqaa/arabic-700.css';
import '@fontsource/noto-nastaliq-urdu/arabic-700.css';
import '@fontsource/reem-kufi/arabic-700.css';
import '@fontsource/amiri/arabic-400.css';
import '@fontsource/amiri-quran/arabic-400.css';
import '@fontsource/amiri/arabic-700.css';
import '../styles/base.css';
import '../styles/calligraphy.css';
import '../styles/classic.css';
import '../styles/kids.css';
import '../styles/gallery.css';
import '../styles/night.css';
import '../styles/takeover.css';
import '../styles/settings.css';

import { face, shownFace } from '../../app/face';
import { sleeping, wake } from '../../core/display';
import { getSpeed, isPreviewing, setSpeed } from '../core/clock';
import { unlockAudio } from '../audio';
import {
  audioBlocked,
  backgroundFor,
  clock,
  endPreview,
  picking,
  previewTheme,
  settings,
  settingsOpen,
  updateSettings,
  viewer,
} from '../store';
import { Crossfade, GearIcon, Phrase, SpeakerIcon, findArt } from './parts';
import { BackgroundPicker } from './settings/Library';
import { LocationPicker } from './settings/LocationPicker';
import { SettingsPanel } from './settings/SettingsPanel';
import { TakeoverLayer } from './Takeover';
import { Theme } from './themes/Theme';
import { Viewer } from './Viewer';

/** The wall's prayer face while it is the one on screen (app/face.ts). */
export function PrayerLayer() {
  return shownFace.value === 'prayer' ? <PrayerFace /> : null;
}

function PrayerFace() {
  const s = settings.value;
  return (
    <div class="prayer-face" data-motion={s.motion}>
      {s.place ? <Clock /> : <Setup />}
    </div>
  );
}

/** Back to the family face (waking the wall, if it slept behind the night clock). */
function toFamily(): void {
  if (sleeping.peek()) wake();
  face.value = 'family';
}

function FamilyButton() {
  return (
    <button class="face-switch" aria-label="Family calendar" title="Family calendar" onClick={toFamily}>
      <CalendarIcon />
    </button>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14h2M14 14h2M8 17.5h2" />
    </svg>
  );
}

function Setup() {
  const bg = backgroundFor('isha', new Date());
  return (
    <div class="setup">
      {bg && <img class="setup-photo" src={bg.url} alt="" />}
      <div class="setup-card">
        <div class="setup-bismillah">
          {findArt('bismillah') ? <Phrase id="bismillah" text="" scale={2} /> : 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'}
        </div>
        <h1>Prayer times</h1>
        <p>
          Prayer times are calculated on this tablet from where the family lives. Choose the place (a phone can do it too, in
          More, then Prayer times).
        </p>
        <LocationPicker onPick={(place) => updateSettings(() => ({ place }))} />
      </div>
      <FamilyButton />
    </div>
  );
}

function Clock() {
  const st = clock.value;
  if (!st) return null;
  // While the wall sleeps (the resting face is this one), the night clock is the night screen.
  const theme = (isPreviewing() && previewTheme.value) || (sleeping.value && !st.takeover ? 'night' : st.theme);
  return (
    <div class={`stage theme-${theme}`}>
      <Crossfade k={theme} ms={1600}>
        <Theme theme={theme} st={st} />
      </Crossfade>
      <Crossfade k={st.takeover ? `${st.takeover.id}:${st.takeover.phase}` : 'none'} ms={1000} fadeOut={!st.takeover}>
        {st.takeover && <TakeoverLayer st={st} />}
      </Crossfade>
      <button class="gear" aria-label="Settings" onClick={() => (settingsOpen.value = true)}>
        <GearIcon />
      </button>
      {!st.takeover && <FamilyButton />}
      {audioBlocked.value && (
        <button class="badge-sound" onClick={unlockAudio}>
          <SpeakerIcon /> Tap to enable athan sound
        </button>
      )}
      {isPreviewing() && (
        <div class="preview-bar">
          <span class="preview-when">
            Preview · {st.now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button class={getSpeed() > 1 ? 'on' : ''} onClick={() => setSpeed(getSpeed() > 1 ? 1 : 60)}>
            {getSpeed() > 1 ? '60× · back to 1×' : 'Fast-forward 60×'}
          </button>
          <button class="primary" onClick={endPreview}>
            Exit
          </button>
        </div>
      )}
      {settingsOpen.value && <SettingsPanel />}
      {settingsOpen.value && picking.value && <BackgroundPicker />}
      {viewer.value && <Viewer />}
    </div>
  );
}
