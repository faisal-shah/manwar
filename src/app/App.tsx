import { signal } from '@preact/signals';
import type { FunctionComponent } from 'preact';
import { CloudOff, Moon, Plus, Settings as SettingsIcon, TriangleAlert } from 'lucide-preact';
import { sync } from '../calendar/engine';
import { demoMode } from '../config';
import { sleeping, wake } from '../core/display';
import { weather, toUnit } from '../core/weather';
import { loadError, ready, settings } from '../data/store';
import { googleProblem, session, startGoogleConnect } from '../data/session';
import { now, nowMs, today } from '../lib/clock';
import { formatHeaderDate, formatTime } from '../lib/date';
import { Button } from '../ui/controls';
import { DOUBLE_TAP_MS, DialogHost, ToastHost, useScrimClose } from '../ui/overlays';
import { WeatherIcon } from '../ui/WeatherIcon';
import { LogoMark, Wordmark } from '../ui/Logo';
import { activeTab, goTo, openSettings, settingsOpen, sleepMenuOpen } from './nav';
import { calendarStatus, currentWeather, householdStatus } from './status';
import { TABS, Overlays, RailBadges } from './tabs';
import { SettingsSheet, SleepMenu } from '../features/settings';
import { isPhone, switchLayout } from './layout';
import { PhoneApp } from '../phone/PhoneApp';

export function App() {
  if (isPhone) return <PhoneApp />;
  const s = session.value;
  if (s.state === 'signedIn' && ready.value) return <Shell />;
  return <ConnectScreen />;
}

function ConnectScreen() {
  const s = session.value;
  const busy =
    s.state === 'loading' || s.state === 'waiting' || s.state === 'connecting' || (s.state === 'signedIn' && !ready.value);
  return (
    <div class="connect">
      <Wordmark size={15} />
      {busy ? (
        <>
          <p>
            {s.state === 'connecting'
              ? 'Connecting your Google account…'
              : s.state === 'waiting'
                ? 'Waiting for the network to open the household…'
                : 'Loading…'}
          </p>
          {s.state === 'signedIn' && loadError.value && (
            <p class="error">The household's data did not load ({loadError.value}). Trying again shortly.</p>
          )}
        </>
      ) : (
        <>
          <p>
            {demoMode
              ? 'Starting the demo household…'
              : 'Sign in with the Google account whose calendars this wall should show. Events added here are saved to it.'}
          </p>
          {s.state === 'error' && <p class="error">{s.error}</p>}
          {!demoMode && (
            <Button variant="primary" onClick={() => startGoogleConnect()}>
              Connect Google account
            </Button>
          )}
          <button type="button" class="connect-alt" onClick={() => switchLayout('phone')}>
            A parent's phone? Pair it with the wall instead
          </button>
        </>
      )}
    </div>
  );
}

function Shell() {
  const tabs = TABS.filter((t) => !settings.value.hiddenTabs.includes(t.id));
  const tab = TABS.find((t) => t.id === activeTab.value) ?? TABS[1];
  const badges = RailBadges();
  return (
    <div class="shell">
      <nav class="rail" aria-label="Tabs">
        {tabs.map((t) => (
          <button
            type="button"
            class={t.id === tab.id ? 'on' : ''}
            aria-current={t.id === tab.id ? 'page' : undefined}
            onClick={() => goTo(t.id)}
          >
            {t.id === 'home' ? <LogoMark size={3} /> : <t.icon size="2.8rem" strokeWidth={1.8} />}
            {t.label}
            {badges[t.id] ? <span class="badge">{badges[t.id]}</span> : null}
          </button>
        ))}
        <div class="rail-spacer" />
        <button type="button" onClick={() => (sleepMenuOpen.value = true)}>
          <Moon size="2.6rem" strokeWidth={1.8} />
          Sleep
        </button>
        <button type="button" onClick={() => (settingsOpen.value = true)}>
          <SettingsIcon size="2.6rem" strokeWidth={1.8} />
          Settings
        </button>
      </nav>
      <div class="main">
        <TopBar title={tab.title?.() ?? null} Controls={tab.Controls} />
        <div class="tab-body">
          <tab.Body />
        </div>
        {tab.onAdd && (
          <button type="button" class="fab" aria-label="Add" onClick={tab.onAdd}>
            <Plus size="3.6rem" strokeWidth={2.2} />
          </button>
        )}
      </div>
      {settingsOpen.value && <SettingsSheet onClose={() => (settingsOpen.value = false)} />}
      {sleepMenuOpen.value && <SleepMenu onClose={() => (sleepMenuOpen.value = false)} />}
      <Overlays />
      <ToastHost />
      <DialogHost />
      {(sleeping.value || wakeShield.value) && <SleepScreen asleep={sleeping.value} />}
    </div>
  );
}

/** True for a moment after a tap woke the wall: the sleep screen stays (fading) to take the rest of a double tap. */
const wakeShield = signal(false);

/**
 * Black screen with the clock; a tap wakes the wall. The second tap of the
 * double tap that chose "Sleep now" lands here and does not wake it, and the
 * second tap of a double tap that wakes it lands here too, not on whatever
 * is under it (a check circle).
 */
function SleepScreen({ asleep }: { asleep: boolean }) {
  const wakeTap = useScrimClose(() => {
    wake();
    wakeShield.value = true;
    setTimeout(() => (wakeShield.value = false), DOUBLE_TAP_MS);
  });
  return (
    <div class={`sleep-screen${asleep ? '' : ' waking'}`} onClick={asleep ? wakeTap : undefined} role="button" aria-label="Wake">
      {formatTime(now.value, settings.value.timeFormat)}
    </div>
  );
}

function TopBar({ title, Controls }: { title: string | null; Controls?: FunctionComponent }) {
  const hour = now.value.getHours();
  // Readings and syncs are stamped with the real clock (not a pinned ?now=).
  void nowMs.value;
  const real = Date.now();
  const w = currentWeather(weather.value, real);
  return (
    <header class="topbar">
      <div class="when">
        <span>{title ?? formatHeaderDate(today.value)}</span>
        <span class="time">{formatTime(now.value, settings.value.timeFormat, { dropZeroMinutes: false })}</span>
      </div>
      {w && (
        <span class="wx" aria-label="Current weather">
          <WeatherIcon code={w.code} size={3} night={!w.isDay || hour < 6 || hour >= 20} />
          {toUnit(w.tempC, settings.value.tempUnit)}°
        </span>
      )}
      <HouseholdStatus />
      <SyncStatus now={real} />
      <div class="controls">{Controls && <Controls />}</div>
    </header>
  );
}

/** A household listener that is down says so on the wall (the loading screen says it before the first load). */
function HouseholdStatus() {
  const st = householdStatus(loadError.value);
  if (!st) return null;
  return (
    <span class="sync-status" role="status" title={st.detail}>
      <CloudOff size="2rem" strokeWidth={2.2} />
      <span>{st.text}</span>
    </span>
  );
}

/** A calendar that stopped syncing says so on the wall; the tap goes to Settings > Google Calendar. */
function SyncStatus({ now: at }: { now: number }) {
  const st = calendarStatus(sync.value, googleProblem.value, at);
  if (!st) return null;
  return (
    <button type="button" class={`sync-status${st.reconnect ? ' bad' : ''}`} onClick={() => openSettings('google')}>
      {st.reconnect ? <TriangleAlert size="2rem" strokeWidth={2.2} /> : <CloudOff size="2rem" strokeWidth={2.2} />}
      <span>{st.text}</span>
    </button>
  );
}
