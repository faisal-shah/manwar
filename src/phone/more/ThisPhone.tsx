import { useState } from 'preact/hooks';
import { buildId } from '../../config';
import { asParent } from '../../core/lock';
import { data, settings } from '../../data/store';
import { disconnect, pairedDevice, session, unpairPhone } from '../../data/session';
import { switchLayout } from '../../app/layout';
import { leavePage } from '../../ui/back';
import { Button } from '../../ui/controls';
import { Wordmark } from '../../ui/Logo';
import { confirm } from '../../ui/overlays';

/**
 * More > This phone: how it is signed in, unpairing it (or, signed in as
 * the wall, signing it out), the wall layout, and what Manwar is.
 */
export function ThisPhone() {
  const device = pairedDevice();
  const me = device ? data.devices.value.find((d) => d.id === device) : undefined;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Leave the household on this phone; once signed out it shows the pairing screen. */
  const leave = async (signOut: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const unpair = async () => {
    if (await confirm('Unpair this phone?', { body: 'To use it again, pair it from the wall.', ok: 'Unpair', danger: true }))
      await leave(unpairPhone);
  };
  const signOut = async () => {
    const ok = await confirm('Sign out of this phone?', {
      body: 'Only this phone signs out: the wall and the paired phones stay signed in. To use the household here again, pair this phone from the wall.',
      ok: 'Sign out',
      danger: true,
    });
    if (ok) await asParent(() => leave(disconnect), 'Enter the PIN to sign out.');
  };
  const toWallLayout = async () => {
    const pin = device && settings.value.lock.pinHash ? ' It asks for the parent PIN before changes, as the wall does.' : '';
    const ok = await confirm('Use the wall layout here?', {
      body: `This phone then works as the wall.${pin} Its screen dims and sleeps on the wall's night and sleep schedule. To come back, open Settings, then About, on it.`,
      ok: 'Use the wall layout',
    });
    if (ok) leavePage(() => switchLayout('wall'));
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
          <>
            <p>Signed in with {session.value.account ?? 'the household account'}, as the wall is.</p>
            <p class="muted">
              A paired phone is listed on the wall, which can remove it, and never asks for the PIN. To pair this one, sign out,
              then pair it from the wall: Settings, then Phones, then Add a phone.
            </p>
          </>
        )}
        {error && <p class="error">{error}</p>}
        {device ? (
          <Button variant="danger" disabled={busy} onClick={unpair}>
            {busy ? 'Unpairing…' : 'Unpair this phone'}
          </Button>
        ) : (
          <Button variant="danger" disabled={busy} onClick={signOut}>
            {busy ? 'Signing out…' : 'Sign out of this phone'}
          </Button>
        )}
      </section>
      <section class="ph-card">
        <h2 class="ph-card-title">Layout</h2>
        <p class="muted">This is the phone companion. A tablet on the wall uses the wall layout.</p>
        <Button onClick={toWallLayout}>Use the wall layout here</Button>
      </section>
      <section class="ph-card ph-about">
        <Wordmark size={7} />
        <p class="muted">Build {buildId}</p>
      </section>
    </div>
  );
}
