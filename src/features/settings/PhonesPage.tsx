import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { renderSVG } from 'uqr';
import { asParent, requireParent } from '../../core/lock';
import { demoMode } from '../../config';
import { cancelPairingCode, makePairingCode, removePhone } from '../../data/session';
import { data } from '../../data/store';
import type { Device } from '../../data/types';
import { nowMs } from '../../lib/clock';
import { formatPairCode } from '../../phone/pairCode';
import { Button } from '../../ui/controls';
import { confirm, toast } from '../../ui/overlays';
import { timeAgo } from '../messages/logic';
import { Group, PageTitle, Row } from './parts';

/** The address a pairing code opens on the phone (the QR code): this wall's, with the code, and the demo household's name in demo mode. */
export function pairingUrl(code: string, here: Location = location): string {
  const url = new URL('/', here.origin);
  if (demoMode) {
    const demo = new URLSearchParams(here.search).get('demo');
    url.searchParams.set('demo', demo ?? '');
  }
  url.searchParams.set('pair', code);
  return url.href;
}

/**
 * Settings > Phones. Parents' phones pair here (only the wall pairs and
 * removes them): Add a phone shows a code for ten minutes, as a QR code the
 * phone's camera opens and as text to type.
 */
export function PhonesPage() {
  const devices = [...data.devices.value].sort((a, b) => a.createdAt - b.createdAt);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number; known: Set<string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A phone paired here never asks for the PIN: ask for it each time, even while the wall is unlocked.
  const add = async () => {
    if (!(await requireParent('Enter the PIN to pair a phone.', { fresh: true }))) return;
    setBusy(true);
    setError(null);
    try {
      const p = await makePairingCode();
      setPairing({ ...p, known: new Set(data.devices.peek().map((d) => d.id)) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // A code put away (Done, or Settings left while it shows) can no longer pair a phone.
  const shown = useRef(pairing);
  shown.current = pairing;
  const putAway = () => {
    const p = shown.current;
    if (p && p.expiresAt > Date.now()) void cancelPairingCode(p.code).catch(() => {});
  };
  useEffect(() => putAway, []);
  const done = () => {
    putAway();
    setPairing(null);
  };
  // The phone that used the code shows up in the list: the code is spent, so put it away.
  const joined = pairing ? devices.find((d) => !pairing.known.has(d.id)) : undefined;
  useEffect(() => {
    if (!joined) return;
    setPairing(null);
    toast(`Paired ${joined.name}`);
  }, [joined?.id]);
  return (
    <>
      <PageTitle>Phones</PageTitle>
      <p class="muted set-intro">
        A parent's phone shows today's schedule and tasks, checks off chores, gives stars, adds to lists, posts notes and starts
        the timer here. It never asks for the PIN.
      </p>
      {pairing ? (
        <PairingCode code={pairing.code} expiresAt={pairing.expiresAt} onNew={add} onDone={done} />
      ) : (
        <div class="pair-add">
          <Button variant="primary" disabled={busy} onClick={add}>
            {busy ? 'Making a code…' : 'Add a phone'}
          </Button>
        </div>
      )}
      {error && <p class="error">{error}</p>}
      <Group title="Paired phones" hint={devices.length ? undefined : 'No phones yet.'}>
        {devices.map((d) => (
          <DeviceRow key={d.id} device={d} />
        ))}
      </Group>
    </>
  );
}

function DeviceRow({ device }: { device: Device }) {
  const [busy, setBusy] = useState(false);
  const n = nowMs.value;
  const used = device.lastSeenAt ? `last used ${timeAgo(device.lastSeenAt, n)}` : 'not used yet';
  const remove = () =>
    asParent(async () => {
      const ok = await confirm(`Remove ${device.name}?`, {
        body: 'It is signed out at once. To use it again, pair it from here.',
        ok: 'Remove',
        danger: true,
      });
      if (!ok) return;
      setBusy(true);
      try {
        await removePhone(device.id);
        toast(`Removed ${device.name}`);
      } catch (e) {
        toast((e as Error).message);
        setBusy(false);
      }
    }, 'Enter the PIN to remove a phone.');
  return (
    <Row label={<bdi>{device.name}</bdi>} hint={`Paired ${timeAgo(device.createdAt, n)}, ${used}`}>
      <Button variant="danger" small disabled={busy} onClick={remove}>
        {busy ? 'Removing…' : 'Remove'}
      </Button>
    </Row>
  );
}

function PairingCode({
  code,
  expiresAt,
  onNew,
  onDone,
}: {
  code: string;
  expiresAt: number;
  onNew: () => void;
  onDone: () => void;
}) {
  const url = pairingUrl(code);
  const svg = useMemo(() => renderSVG(url, { border: 2, whiteColor: '#ffffff', blackColor: '#000000' }), [url]);
  const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  void nowMs.value;
  const expired = left === 0;
  return (
    <section class="pair-card" aria-label="Pairing code">
      <div class={`pair-qr${expired ? ' expired' : ''}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <div class="pair-text">
        <p>Point the phone's camera at the code and open the link, or go to</p>
        <p class="pair-host">{new URL(url).host}</p>
        <p>on the phone and enter</p>
        <p class="pair-code" aria-label={`Code ${code.split('').join(' ')}`}>
          {formatPairCode(code)}
        </p>
        <p class="muted">
          {expired
            ? 'This code has expired.'
            : `Works once, for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} more.`}
        </p>
        <div class="row">
          {expired && (
            <Button variant="primary" onClick={onNew}>
              New code
            </Button>
          )}
          <Button onClick={onDone}>{expired ? 'Close' : 'Done'}</Button>
        </div>
      </div>
    </section>
  );
}
