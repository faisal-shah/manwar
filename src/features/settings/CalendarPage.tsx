import { settings } from '../../data/store';
import type { Settings } from '../../data/types';
import { dayLong } from '../../lib/date';
import { Stepper } from '../../ui/controls';
import { ChoiceRow, Group, PageTitle, Row, ToggleRow, change } from './parts';

export function CalendarPage() {
  const s = settings.value;
  const flag = (
    key: keyof Settings &
      ('dimPast' | 'shadeWeekends' | 'stripeMultiProfile' | 'scheduleStartToday' | 'weekStartToday' | 'monthStartCurrentWeek'),
  ) => ({ on: s[key], onChange: (on: boolean) => void change({ [key]: on }) });
  return (
    <>
      <PageTitle>Calendar</PageTitle>
      <Group>
        <ChoiceRow
          label="Week starts on"
          value={String(s.weekStart) as '0' | '1'}
          options={[
            { value: '0', label: 'Sunday' },
            { value: '1', label: 'Monday' },
          ]}
          onChange={(v) => void change({ weekStart: v === '1' ? 1 : 0 })}
        />
        <ChoiceRow
          label="Time"
          value={s.timeFormat}
          options={[
            { value: '12h', label: '12-hour' },
            { value: '24h', label: '24-hour' },
          ]}
          onChange={(timeFormat) => void change({ timeFormat })}
        />
        <ChoiceRow
          label="Show countdowns"
          value={s.countdownWindow}
          options={[
            { value: 'always', label: 'Always' },
            { value: '3m', label: '3 months before' },
            { value: '1m', label: '1 month before' },
          ]}
          onChange={(countdownWindow) => void change({ countdownWindow })}
        />
      </Group>
      <Group title="Events">
        <ToggleRow label="Dim past events" {...flag('dimPast')} />
        <ToggleRow label="Shade weekends" {...flag('shadeWeekends')} />
        <ToggleRow
          label="Stripe events shared by several profiles"
          hint="Each profile's color in diagonal stripes"
          {...flag('stripeMultiProfile')}
        />
      </Group>
      <Group title="Schedule view">
        <Row label="Days shown">
          <Stepper value={s.scheduleDays} min={1} max={7} onChange={(scheduleDays) => void change({ scheduleDays })} />
        </Row>
        <ToggleRow
          label="Start on today"
          hint={`Otherwise the schedule starts on ${dayLong(s.weekStart)}`}
          {...flag('scheduleStartToday')}
        />
      </Group>
      <Group title="Week view">
        <ToggleRow
          label="Start on today"
          hint={`Otherwise the week starts on ${dayLong(s.weekStart)}`}
          {...flag('weekStartToday')}
        />
      </Group>
      <Group title="Month view">
        <ToggleRow
          label="Start on the current week"
          hint="Weeks already past drop off the top"
          {...flag('monthStartCurrentWeek')}
        />
      </Group>
    </>
  );
}
