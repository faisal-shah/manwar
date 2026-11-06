import { useRef, useState } from 'preact/hooks';
import { pairParam, pairPhone, session } from '../data/session';
import { loadError } from '../data/store';
import { currentTime, nowMs } from '../lib/clock';
import { alwaysPhone, screenShortSide, switchLayout } from '../app/layout';
import { Button } from '../ui/controls';
import { Wordmark } from '../ui/Logo';
import { formatPairCode } from './pairCode';

/** Loading this long without an answer is said to be a connection problem. */
const SLOW_MS = 8000;

/**
 * A phone that is not paired yet: the code from the wall (Settings > Phones
 * > Add a phone, or the QR code, which opens this page with it filled in)
 * and a name for the phone.
 */
export function PairScreen() {
  const s = session.value;
  const [code, setCode] = useState(formatPairCode(pairParam ?? ''));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = s.state === 'loading' || s.state === 'waiting' || s.state === 'signedIn';
  // Signed in, the household opens once the server has answered (store.ts ready): say so if that takes a while,
  // counted from when this state began (the pairing form may have been open for minutes).
  const since = useRef({ state: s.state, at: currentTime() });
  if (since.current.state !== s.state) since.current = { state: s.state, at: currentTime() };
  const slow = s.state === 'signedIn' && nowMs.value - since.current.at > SLOW_MS;
  const pair = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await pairPhone(code, name);
      // The code is used up: a reload must not show it again.
      const url = new URL(location.href);
      url.searchParams.delete('pair');
      history.replaceState(history.state, '', url.href);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <div class="ph-pair">
      <Wordmark size={8} />
      {loading ? (
        <div class="ph-loading" role="status">
          <p class="muted">{s.state === 'waiting' ? 'Waiting for the network…' : 'Loading…'}</p>
          {loadError.value ? (
            <p class="error">The household's data is not coming in ({loadError.value}). Trying again shortly.</p>
          ) : (
            slow && <p class="muted">Can't reach the household yet. It opens once this phone is online.</p>
          )}
        </div>
      ) : (
        <form onSubmit={pair}>
          <h1>Pair this phone</h1>
          <p class="muted">
            On the wall, open Settings, then Phones, then Add a phone. Scan the code with this phone's camera, or type the code
            here.
          </p>
          {s.state === 'error' && s.error && <p class="error">{s.error}</p>}
          <label class="field">
            <span class="field-label">Pairing code</span>
            <input
              class="input ph-code"
              value={code}
              onInput={(e) => setCode(formatPairCode(e.currentTarget.value))}
              autocapitalize="characters"
              autocomplete="one-time-code"
              spellcheck={false}
              inputMode="text"
              placeholder="ABCD-EFGH"
              aria-label="Pairing code"
            />
          </label>
          <label class="field">
            <span class="field-label">Name for this phone</span>
            <input
              class="input"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              maxLength={40}
              placeholder="Mamma's phone"
              aria-label="Name for this phone"
            />
          </label>
          {error && <p class="error">{error}</p>}
          <Button variant="primary" type="submit" disabled={busy || code.replace('-', '').length !== 8 || !name.trim()}>
            {busy ? 'Pairing…' : 'Pair'}
          </Button>
          {/* A wall tablet that opened as a phone, signed out (a signed-in device switches in This phone); never a phone's screen. */}
          {!alwaysPhone(screenShortSide()) && (
            <button type="button" class="ph-link" onClick={() => switchLayout('wall')}>
              This is the wall: use the wall layout
            </button>
          )}
        </form>
      )}
    </div>
  );
}
