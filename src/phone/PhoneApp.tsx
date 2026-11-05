import { effect, signal } from '@preact/signals';
import { ArrowLeft, CloudOff, CloudUpload, TriangleAlert } from 'lucide-preact';
import { sync } from '../calendar/engine';
import { googleProblem, session } from '../data/session';
import { householdId, loadError, ready, unsentWrites } from '../data/store';
import { currentTime, nowMs } from '../lib/clock';
import { calendarStatus, householdStatus, unsentStatus } from '../app/status';
import { IngredientsHost } from '../features/meals/IngredientsModal';
import { useBack } from '../ui/back';
import { IconButton } from '../ui/controls';
import { DialogHost, ToastHost } from '../ui/overlays';
import { calView } from './calendar/state';
import { openListId } from './lists/state';
import { moreView } from './more';
import { goPhone, phoneTab } from './nav';
import { noteDraft } from './notes';
import { PHONE_PAGES } from './pages';
import { PairScreen } from './PairScreen';
import './phone.css';

/*
 * Where this phone was (tab, open list, More view, Calendar view, kept for
 * the session) and a note being written belong to the household it was
 * signed in to: signed out (unpaired, removed), they go.
 */
let household = householdId.peek();
effect(() => {
  const next = householdId.value;
  if (household && next !== household) {
    phoneTab.value = 'today';
    openListId.value = null;
    moreView.value = null;
    calView.value = 'agenda';
    noteDraft.value = '';
  }
  household = next;
});

/** The phone companion: pairing until signed in, then the tabs. */
export function PhoneApp() {
  const s = session.value;
  if (s.state === 'signedIn' && ready.value) return <PhoneShell />;
  return <PairScreen />;
}

function PhoneShell() {
  const page = PHONE_PAGES.find((p) => p.id === phoneTab.value) ?? PHONE_PAGES[0];
  // Back from another tab returns to Today, as phone apps do; from Today it leaves the app.
  useBack('tab', () => goPhone('today'), page.id !== 'today');
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
      <nav class="ph-nav" aria-label="Tabs" data-tap-through>
        {PHONE_PAGES.map((p) => {
          const n = p.badge?.() ?? 0;
          return (
            <button
              type="button"
              key={p.id}
              class={p.id === page.id ? 'on' : ''}
              aria-current={p.id === page.id ? 'page' : undefined}
              // The tab shown goes to its top, as a phone's tab bar does.
              onClick={() => (p.id === page.id ? back?.() : goPhone(p.id))}
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
/** Since when changes made here have been waiting for the server (null while none are). */
const unsentSince = signal<number | null>(null);
effect(() => {
  const waiting = unsentWrites.value > 0;
  if (!waiting) unsentSince.value = null;
  else if (unsentSince.peek() === null) unsentSince.value = currentTime();
});

function PhoneStatus() {
  const house = householdStatus(loadError.value);
  const now = nowMs.value;
  const cal = calendarStatus(sync.value, googleProblem.value, Date.now());
  const unsent = unsentStatus(unsentWrites.value, unsentSince.value, now);
  if (!house && !cal && !unsent) return null;
  return (
    <div class="ph-status" role="status">
      {unsent && (
        <span>
          <CloudUpload size="1.6rem" /> {unsent}
        </span>
      )}
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
