import { signal } from '@preact/signals';
import type { ISODate } from '../../data/types';
import { stored } from '../../lib/stored';

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
