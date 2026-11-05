import type { ComponentType, FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  CalendarDays,
  CalendarSync,
  CloudSun,
  Info,
  ListChecks,
  Lock,
  Monitor,
  Smartphone,
  Users,
  Utensils,
} from 'lucide-preact';
import { settingsPage } from '../../app/nav';
import { requireParent, unlocked } from '../../core/lock';
import { Sheet } from '../../ui/overlays';
import { CalendarPage } from './CalendarPage';
import { DisplayPage } from './DisplayPage';
import { GooglePage } from './GooglePage';
import { LockPage } from './LockPage';
import { AboutPage, MealsPage, TasksPage } from './OtherPages';
import { PhonesPage } from './PhonesPage';
import { ProfilesPage } from './ProfilesPage';
import { WeatherPage } from './WeatherPage';
import './settings.css';

export { SleepMenu } from './SleepMenu';

interface PageDef {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number }>;
  Page: FunctionComponent<{ onClose: () => void }>;
}

const PAGES: PageDef[] = [
  { id: 'profiles', label: 'Profiles', icon: Users, Page: ProfilesPage },
  { id: 'google', label: 'Google Calendar', icon: CalendarSync, Page: GooglePage },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, Page: CalendarPage },
  { id: 'display', label: 'Display', icon: Monitor, Page: DisplayPage },
  { id: 'weather', label: 'Weather', icon: CloudSun, Page: WeatherPage },
  { id: 'meals', label: 'Meals', icon: Utensils, Page: MealsPage },
  { id: 'lock', label: 'Parental lock', icon: Lock, Page: LockPage },
  { id: 'phones', label: 'Phones', icon: Smartphone, Page: PhonesPage },
  { id: 'tasks', label: 'Tasks', icon: ListChecks, Page: TasksPage },
  { id: 'about', label: 'About', icon: Info, Page: AboutPage },
];

/** The rail's Settings: behind the PIN when the lock is on. */
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [allowed, setAllowed] = useState(() => unlocked.value);
  useEffect(() => {
    if (!allowed) void requireParent('Enter the PIN to open Settings.').then((ok) => (ok ? setAllowed(true) : onClose()));
  }, []);
  if (!allowed) return null;
  const current = PAGES.find((p) => p.id === settingsPage.value) ?? PAGES[0];
  return (
    <Sheet title="Settings" wide onClose={onClose}>
      <div class="settings">
        <nav class="set-menu" aria-label="Settings pages">
          {PAGES.map((p) => (
            <button
              type="button"
              class={p.id === current.id ? 'on' : ''}
              aria-current={p.id === current.id ? 'page' : undefined}
              onClick={() => (settingsPage.value = p.id)}
            >
              <p.icon size="2.2rem" strokeWidth={1.9} />
              {p.label}
            </button>
          ))}
        </nav>
        <div class="set-page scroll" key={current.id}>
          <current.Page onClose={onClose} />
        </div>
      </div>
    </Sheet>
  );
}
