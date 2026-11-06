import type { ComponentChildren } from 'preact';
import { demoMode } from '../../config';
import { requireParent, unlocked } from '../../core/lock';
import { settings } from '../../data/store';
import { pairedDevice, session } from '../../data/session';
import { phoneSized, screenShortSide, switchLayout } from '../../app/layout';
import { Button } from '../../ui/controls';
import { version } from '../../../package.json';
import { buildId } from '../../config';
import { Wordmark } from '../../ui/Logo';
import { NAME_EN } from '../../ui/brand';
import { MealCategoriesEditor } from '../meals/MealCategoriesEditor';
import { ChoiceRow, Group, PageTitle, Row, change } from './parts';

/** Asks for the PIN before any tap inside a component that writes settings itself. */
function ParentGuard({ children }: { children: ComponentChildren }) {
  return (
    <div
      onClickCapture={(e) => {
        if (unlocked.value) return;
        e.preventDefault();
        e.stopPropagation();
        void requireParent('Enter the PIN to change settings.');
      }}
    >
      {children}
    </div>
  );
}

export function MealsPage() {
  return (
    <>
      <PageTitle>Meals</PageTitle>
      <ParentGuard>
        <MealCategoriesEditor />
      </ParentGuard>
    </>
  );
}

export function TasksPage() {
  const s = settings.value;
  return (
    <>
      <PageTitle>Tasks</PageTitle>
      <Group hint="Routines can show Morning, Afternoon and Evening all day, or only the part of the day it is now.">
        <ChoiceRow
          label="Parts of the day"
          value={s.tasksShowAllParts ? 'all' : 'current'}
          options={[
            { value: 'all', label: 'All parts' },
            { value: 'current', label: 'Current part only' },
          ]}
          onChange={(v) => void change({ tasksShowAllParts: v === 'all' })}
        />
      </Group>
    </>
  );
}

/** A paired phone switched to the wall layout, or a screen the size of a phone (layout.ts's rule). */
const likelyPhone = () => !!pairedDevice() || phoneSized(screenShortSide());

export function AboutPage() {
  return (
    <>
      <PageTitle>About</PageTitle>
      <div class="about-mark">
        <Wordmark size={10} />
      </div>
      <Group>
        <Row label={NAME_EN} hint="Family wall calendar">
          <span class="set-value">
            Version {version} ({buildId})
          </span>
        </Row>
        <Row label="Build">
          <span class="set-value">{import.meta.env.MODE}</span>
        </Row>
        <Row label="Household account">
          <span class="set-value">{session.value.account ?? 'Not connected'}</span>
        </Row>
      </Group>
      {likelyPhone() && (
        <Group title="This device">
          <Row label="Phone layout" hint="The phone companion, made for a phone's screen.">
            <Button small onClick={() => switchLayout('phone')}>
              Use the phone layout here
            </Button>
          </Row>
        </Group>
      )}
      {demoMode && (
        <Group title="Demo mode">
          <Row
            label="Demo data"
            hint="This wall runs on the local Firebase emulators with a demo family and a fake calendar. Restarting the emulators resets the demo households, and clearing this browser's site data resets the fake calendar's events. A new ?demo=name in the address opens a fresh household."
          />
        </Group>
      )}
    </>
  );
}
