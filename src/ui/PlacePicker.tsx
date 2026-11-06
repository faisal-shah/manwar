import { useEffect, useState } from 'preact/hooks';
import { LocateFixed, MapPin, Search } from 'lucide-preact';
import { deviceTimezone, isDeviceTimezone, locateDevice, searchPlaces, type PlaceResult } from '../core/place';
import type { Place } from '../data/types';
import { Button } from './controls';

const SEARCH_DELAY_MS = 350;

/**
 * Choosing the household's place: this device's location, or a search as
 * the name is typed. The wall's Settings > Location and the phone's More >
 * Prayer times show it; `onPick` writes the choice.
 */
export function PlacePicker({ device, onPick }: { device: 'tablet' | 'phone'; onPick: (p: Place) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    setError(null);
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let live = true;
    const id = setTimeout(() => {
      setBusy(true);
      searchPlaces(q)
        .then((r) => live && setResults(r))
        .catch(() => {
          if (!live) return;
          // The last query's places are not answers to this one.
          setResults(null);
          setError('The place search is not reachable. Check the Wi-Fi and try again.');
        })
        .finally(() => live && setBusy(false));
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query]);

  const pick = (p: Place) => {
    onPick(p);
    setQuery('');
    setResults(null);
  };
  const locate = () => {
    setBusy(true);
    setError(null);
    locateDevice()
      .then(pick)
      .catch((e: unknown) =>
        setError(
          e instanceof GeolocationPositionError
            ? `This ${device}'s location is not available (permission denied, or not found). Search for the town instead.`
            : 'The location could not be named. Check the Wi-Fi and try again.',
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div class="place-picker">
      <Button onClick={locate} disabled={busy}>
        <LocateFixed size="2rem" /> Use this {device}'s location
      </Button>
      <label class="place-search">
        <Search size="2.2rem" />
        <input
          class="input"
          type="search"
          aria-label="Search for a place"
          placeholder="Search for a town or city"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
      </label>
      {busy && <p class="muted place-note">Searching</p>}
      {error && (
        <p class="place-error place-note" role="alert">
          {error}
        </p>
      )}
      {results?.length === 0 && !busy && <p class="muted place-note">No places found.</p>}
      {!!results?.length && (
        <ul class="place-results">
          {results.map((r) => (
            <li key={`${r.place.lat},${r.place.lon}`}>
              <button type="button" onClick={() => pick(r.place)}>
                <MapPin size="2.2rem" class="muted" />
                <span>
                  <bdi>{r.place.name}</bdi>
                  <small class="muted">
                    {r.detail}
                    {!isDeviceTimezone(r.place.timezone) && ` · ${r.place.timezone} (this ${device}: ${deviceTimezone()})`}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
