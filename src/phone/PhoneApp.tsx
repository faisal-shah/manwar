import { ArrowLeft, CloudOff, TriangleAlert } from 'lucide-preact';
import { sync } from '../calendar/engine';
import { googleProblem, session } from '../data/session';
import { loadError, ready } from '../data/store';
import { nowMs } from '../lib/clock';
import { calendarStatus, householdStatus } from '../app/status';
import { IngredientsHost } from '../features/meals/IngredientsModal';
import { useBack } from '../ui/back';
import { IconButton } from '../ui/controls';
import { DialogHost, ToastHost } from '../ui/overlays';
import { goPhone, phoneTab } from './nav';
import { PHONE_PAGES } from './pages';
import { PairScreen } from './PairScreen';
import './phone.css';

/** The phone companion: pairing until signed in, then the tabs. */
export function PhoneApp() {
  const s = session.value;
  if (s.state === 'signedIn' && ready.value) return <PhoneShell />;
  return <PairScreen />;
}

function PhoneShell() {
  const page = PHONE_PAGES.find((p) => p.id === phoneTab.value) ?? PHONE_PAGES[0];
  // Back from another tab returns to Today, as phone apps do; from Today it leaves the app.
  useBack(() => goPhone('today'), page.id !== 'today');
  const back = page.back?.() ?? null;
  return (
    <div class="ph">
      <header class="ph-head">
        {back && (
          <IconButton label="Back" class="ph-back" onClick={back}>
            <ArrowLeft size="2.4rem" />
          </IconButton>
        )}
        <h1 dir="auto">{page.title?.() ?? page.label}</h1>
        {page.Action && <page.Action />}
      </header>
      <PhoneStatus />
      <main class="ph-body" key={page.id}>
        <page.Body />
      </main>
      <nav class="ph-nav" aria-label="Tabs">
        {PHONE_PAGES.map((p) => {
          const n = p.badge?.() ?? 0;
          return (
            <button
              type="button"
              key={p.id}
              class={p.id === page.id ? 'on' : ''}
              aria-current={p.id === page.id ? 'page' : undefined}
              onClick={() => goPhone(p.id)}
            >
              <p.icon size="2.4rem" strokeWidth={p.id === page.id ? 2.2 : 1.8} />
              {p.label}
              {n > 0 && <span class="badge">{n}</span>}
            </button>
          );
        })}
      </nav>
      <IngredientsHost />
      <ToastHost />
      <DialogHost />
    </div>
  );
}

/** The household not syncing, or the calendar needing attention: a line under the header. */
function PhoneStatus() {
  const house = householdStatus(loadError.value);
  void nowMs.value;
  const cal = calendarStatus(sync.value, googleProblem.value, Date.now());
  if (!house && !cal) return null;
  return (
    <div class="ph-status" role="status">
      {house && (
        <span title={house.detail}>
          <CloudOff size="1.6rem" /> {house.text}
        </span>
      )}
      {cal && (
        <span>
          {cal.reconnect ? <TriangleAlert size="1.6rem" /> : <CloudOff size="1.6rem" />}{' '}
          {cal.reconnect ? 'Google Calendar needs reconnecting on the wall' : cal.text}
        </span>
      )}
    </div>
  );
}
