import '@fontsource/reem-kufi/arabic-700.css';
import { MEANING, NAME_AR, NAME_EN } from './brand';
import './logo.css';

/** The Arabic name alone, as the logo (nav rail, small places). Size is the font size in rem. */
export function LogoMark({ size = 2.6 }: { size?: number }) {
  return (
    <span class="logo-mark" lang="ar" dir="rtl" style={{ fontSize: `${size}rem` }} aria-label={NAME_EN}>
      {NAME_AR}
    </span>
  );
}

/** Calligraphy, transliteration and meaning: the sign-in screen and Settings > About. */
export function Wordmark({ size = 14 }: { size?: number }) {
  return (
    <div class="wordmark" style={{ '--wm': `${size}rem` }}>
      <span class="logo-mark wm-ar" lang="ar" dir="rtl">
        {NAME_AR}
      </span>
      <span class="wm-en">{NAME_EN}</span>
      <span class="wm-mean">{MEANING}</span>
    </div>
  );
}
