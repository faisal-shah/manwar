import { useState } from 'preact/hooks';
import { buildId } from '../../config';
import { data } from '../../data/store';
import { pairedDevice, session, unpairPhone } from '../../data/session';
import { switchLayout } from '../../app/layout';
import { Button } from '../../ui/controls';
import { Wordmark } from '../../ui/Logo';
import { confirm } from '../../ui/overlays';

/** More > This phone: its name, unpairing, the wall layout, and what Manwar is. */
export function ThisPhone() {
  const device = pairedDevice();
  const me = device ? data.devices.value.find((d) => d.id === device) : undefined;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unpair = async () => {
    if (!(await confirm('Unpair this phone?', { body: 'To use it again, pair it from the wall.', ok: 'Unpair', danger: true })))
      return;
    setBusy(true);
    setError(null);
    try {
      await unpairPhone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div class="ph-stack">
      <section class="ph-card">
        <h2 class="ph-card-title">This phone</h2>
        {device ? (
          <p>
            Paired as <b dir="auto">{me?.name ?? 'a phone'}</b>
            {session.value.account ? ` with ${session.value.account}` : ''}.
          </p>
        ) : (
          <p>Signed in with {session.value.account ?? 'the household account'}, as the wall is.</p>
        )}
        {error && <p class="error">{error}</p>}
        {device && (
          <Button variant="danger" disabled={busy} onClick={unpair}>
            {busy ? 'Unpairing…' : 'Unpair this phone'}
          </Button>
        )}
      </section>
      <section class="ph-card">
        <h2 class="ph-card-title">Layout</h2>
        <p class="muted">This is the phone companion. A tablet on the wall uses the wall layout.</p>
        <Button onClick={() => switchLayout('wall')}>Use the wall layout here</Button>
      </section>
      <section class="ph-card ph-about">
        <Wordmark size={7} />
        <p class="muted">Build {buildId}</p>
      </section>
    </div>
  );
}
