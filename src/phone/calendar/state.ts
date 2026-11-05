import { computed, signal } from '@preact/signals';
import { loadedRange, sync } from '../../calendar/engine';
import { profiles } from '../../data/store';
import type { ISODate } from '../../data/types';
import { stored } from '../../lib/stored';
import { hiddenBy } from './filter';

type CalView = 'agenda' | 'assign';

/** The Calendar tab's view: the agenda, or the events waiting to be assigned (kept for the session, nav.ts). */
export const calView = stored<CalView>(
  'manwar.phone.calView.v1',
  'agenda',
  (v): v is CalView => v === 'agenda' || v === 'assign',
  'session',
);

/** The day the agenda starts on (Go to date); null follows today. */
export const agendaStart = signal<ISODate | null>(null);

/** The day at the top of the agenda (the header's month, + adds on it); null while that is today. */
export const lookingAt = signal<ISODate | null>(null);

const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** The people the agenda shows (filter.ts), kept on this phone. */
export const shownPeople = stored<string[]>('manwar.phone.calPeople.v1', [], isIds);

/** The profiles that filter hides, for the engine's `hidden` arguments: the Calendar tab and Today show the same events. */
export const hiddenPeople = computed(() =>
  hiddenBy(
    shownPeople.value,
    profiles.value.map((p) => p.id),
  ),
);

/**
 * What the agenda and Today say while no events are known yet (no fetch has
 * answered and there is no offline snapshot); null once there are.
 */
export const notLoaded = computed(() =>
  loadedRange.value ? null : sync.value.error ? 'The calendar could not be loaded yet.' : 'Loading the calendar…',
);
