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

import { useLayoutEffect } from 'preact/hooks';
import { shownFace } from '../../app/face';
import { sleeping } from '../../core/display';
import { previewing, setSpeed, speed } from '../core/clock';
import { unlockAudio } from '../audio';
import { clockView } from '../rules';
import {
  audioBlocked,
  backgroundFor,
  clock,
  endPreview,
  picking,
  place,
  previewTheme,
  settings,
  settingsOpen,
  viewer,
} from '../store';
import { chooseLocation, toFamily } from './nav';
import { Crossfade, GearIcon, Phrase, SpeakerIcon, findArt } from './parts';
import { BackgroundPicker } from './settings/Library';
import { SettingsPanel } from './settings/SettingsPanel';
import { TakeoverLayer } from './Takeover';
import { Theme } from './themes/Theme';
import { Viewer } from './Viewer';

/** The wall's prayer face while it is the one on screen (app/face.ts). */
export function PrayerLayer() {
  return shownFace.value === 'prayer' ? <PrayerFace /> : null;
}

/** What the family face has open outside #app (sheets, toasts portaled to the page) is inert under the prayer face too. */
function coverFamily(covered: boolean): void {
  for (const el of document.body.children) {
    if (el.classList.contains('prayer-face')) continue;
    if (covered && !el.hasAttribute('inert')) {
      el.setAttribute('inert', '');
      el.setAttribute('data-face-inert', '');
    } else if (!covered && el.hasAttribute('data-face-inert')) {
      el.removeAttribute('inert');
      el.removeAttribute('data-face-inert');
    }
  }
  // A field in a sheet keeps neither focus nor the on-screen keyboard behind the prayer face.
  const active = document.activeElement;
  if (covered && active instanceof HTMLElement && !active.closest('.prayer-face')) active.blur();
}

/**
 * The family face under this one takes no taps, focus or reading for as
 * long as it is mounted, and gets them back when it unmounts: the family
 * face shown again, or the shell gone with the household (a sign-out).
 */
function useCoverFamily(): void {
  useLayoutEffect(() => {
    const cover = (on: boolean) => {
      document.documentElement.dataset.face = on ? 'prayer' : 'family';
      document.getElementById('app')?.toggleAttribute('inert', on);
      coverFamily(on);
    };
    cover(true);
    return () => cover(false);
  }, []);
}

function PrayerFace() {
  useCoverFamily();
  const s = settings.value;
  return (
    <div class="prayer-face" data-motion={s.motion}>
      {place.value ? <Clock /> : <Setup />}
    </div>
  );
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
          Prayer times are calculated on this tablet for where the family lives. Choose the place in Settings, under Location (a
          phone can do it too, in More, then Prayer times); the weather is for it too.
        </p>
        <button class="pf-btn primary" onClick={chooseLocation}>
          Choose the place
        </button>
      </div>
      <FamilyButton />
    </div>
  );
}

function Clock() {
  const st = clock.value;
  if (!st) return null;
  const { theme, takeover } = clockView(st, {
    asleep: sleeping.value,
    previewTheme: previewing.value ? previewTheme.value : null,
  });
  return (
    <div class={`stage theme-${theme}`}>
      <Crossfade k={theme} ms={1600}>
        <Theme theme={theme} st={st} />
      </Crossfade>
      <Crossfade k={takeover ? `${takeover.id}:${takeover.phase}` : 'none'} ms={1000} fadeOut={!takeover}>
        {takeover && <TakeoverLayer st={st} />}
      </Crossfade>
      <button class="gear" aria-label="Settings" onClick={() => (settingsOpen.value = true)}>
        <GearIcon />
      </button>
      {!takeover && <FamilyButton />}
      {audioBlocked.value && (
        <button class="badge-sound" onClick={unlockAudio}>
          <SpeakerIcon /> Tap to enable athan sound
        </button>
      )}
      {previewing.value && (
        <div class="preview-bar">
          <span class="preview-when">
            Preview · {st.now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button class={speed.value > 1 ? 'on' : ''} onClick={() => setSpeed(speed.value > 1 ? 1 : 60)}>
            {speed.value > 1 ? '60× · back to 1×' : 'Fast-forward 60×'}
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
