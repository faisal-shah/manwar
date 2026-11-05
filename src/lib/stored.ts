import { signal, type Signal } from '@preact/signals';

/**
 * A signal kept in the browser's storage under `key`: `local` lasts on this
 * device, `session` for this tab (a reload, an update, or the phone's
 * browser bringing back a tab it put away keeps it). A stored value `valid`
 * refuses reads as `fallback`; with no storage, the value lasts the page.
 */
export function stored<T>(
  key: string,
  fallback: T,
  valid: (v: unknown) => v is T,
  area: 'local' | 'session' = 'local',
): Signal<T> {
  const storage = () => (area === 'local' ? localStorage : sessionStorage);
  let initial = fallback;
  try {
    const raw = storage().getItem(key);
    if (raw !== null) {
      const v: unknown = JSON.parse(raw);
      if (valid(v)) initial = v;
    }
  } catch {
    /* storage unavailable: use the default */
  }
  const s = signal(initial);
  s.subscribe((v) => {
    try {
      storage().setItem(key, JSON.stringify(v));
    } catch {
      /* storage unavailable: the value lasts the page */
    }
  });
  return s;
}
