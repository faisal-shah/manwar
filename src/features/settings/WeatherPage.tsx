import { useEffect, useState } from 'preact/hooks';
import { MapPin, Search } from 'lucide-preact';
import { searchPlaces, type Place } from '../../core/weather';
import { settings } from '../../data/store';
import { ChoiceRow, Group, NavRow, PageTitle, Row, change } from './parts';

const SEARCH_DELAY_MS = 350;

/** "Austin, Texas": the place and its region, without the country. */
const placeName = (p: Place) => (p.detail ? `${p.name}, ${p.detail.split(', ')[0]}` : p.name);

export function WeatherPage() {
  const s = settings.value;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
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

  const pick = (p: Place) =>
    change({ weather: { lat: p.lat, lon: p.lon, name: placeName(p) } }).then(() => {
      setQuery('');
      setResults(null);
    });

  return (
    <>
      <PageTitle>Weather</PageTitle>
      <Group>
        <Row
          lead={<MapPin size="2.4rem" class="muted" />}
          label={s.weather?.name ?? 'No location set'}
          hint={s.weather ? 'The top bar and calendar days show the weather here.' : 'Search for your town to show the weather.'}
        />
      </Group>
      <Group title="Change location">
        <label class="set-search">
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
        {busy && <p class="muted set-note">Searching</p>}
        {error && <p class="set-error set-note">{error}</p>}
        {results?.length === 0 && !busy && <p class="muted set-note">No places found.</p>}
        {results?.map((p) => (
          <NavRow lead={<MapPin size="2.2rem" class="muted" />} label={p.name} hint={p.detail} onClick={() => void pick(p)} />
        ))}
      </Group>
      <Group title="Units">
        <ChoiceRow
          label="Temperature"
          value={s.tempUnit}
          options={[
            { value: 'f', label: 'Fahrenheit (°F)' },
            { value: 'c', label: 'Celsius (°C)' },
          ]}
          onChange={(tempUnit) => void change({ tempUnit })}
        />
      </Group>
    </>
  );
}
