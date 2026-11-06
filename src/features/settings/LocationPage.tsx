import { MapPin } from 'lucide-preact';
import { timezoneNote } from '../../core/place';
import { settings } from '../../data/store';
import { PlacePicker } from '../../ui/PlacePicker';
import { ChoiceRow, Group, PageTitle, Row, change } from './parts';

/** Where the family lives: the weather (top bar, calendar days, the prayer face) and the prayer times are for it. */
export function LocationPage() {
  const s = settings.value;
  const p = s.place;
  return (
    <>
      <PageTitle>Location</PageTitle>
      <Group hint={(p && timezoneNote(p)) ?? undefined}>
        <Row
          lead={<MapPin size="2.4rem" class="muted" />}
          label={p ? <bdi>{p.name}</bdi> : 'No location set'}
          hint={
            p ? 'The weather and the prayer times are for this place.' : 'Choose your town for the weather and the prayer times.'
          }
        />
      </Group>
      <Group title={p ? 'Change location' : 'Choose location'}>
        <PlacePicker device="tablet" onPick={(place) => void change({ place })} />
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
