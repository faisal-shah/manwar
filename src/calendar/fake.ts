import type { ISODate, Repeat, Weekday } from '../data/types';
import { addDays, dateAt, diffDays, minutesOfDay, minutesToHHMM, toISODate } from '../lib/date';
import { occursOn, shiftRepeat } from '../lib/repeat';
import { currentTime } from '../lib/clock';
import { toRRule } from './rrule';
import { eventKey, type CalEvent, type CalendarInfo, type CalendarSource, type EventDraft } from './types';

/**
 * In-browser stand-in for Google Calendar (demo mode and tests). Series are
 * stored as masters in localStorage and expanded with the same repeat rules
 * the app uses elsewhere.
 */
interface Master {
  id: string;
  calendarId: string;
  title: string;
  allDay: boolean;
  day: ISODate;
  /** Minutes after midnight (timed) */
  startMin: number;
  durMin: number;
  /** All-day: number of days */
  days: number;
  repeat?: Repeat;
  exdates: ISODate[];
  overrides: Record<ISODate, { title?: string; day?: ISODate; startMin?: number; durMin?: number }>;
  location?: string;
  description?: string;
  organizer?: string;
  reminderMinutes?: number | null;
}

const KEY = 'manwar.demoCalendar.v1';

/**
 * The demo calendar fails as Google's would: offline (`navigator.onLine`
 * false) no request answers, and the calendars listed in localStorage
 * `manwar.demoCalendarDown.v1` (a JSON list of ids, or "all") stay
 * unreachable, for tests of sync failures and offline edits.
 */
const DOWN_KEY = 'manwar.demoCalendarDown.v1';

function reach(calendarId?: string): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('Failed to fetch');
  let down: unknown = null;
  try {
    down = JSON.parse(localStorage.getItem(DOWN_KEY) ?? 'null');
  } catch {
    /* no storage: everything answers */
  }
  if (down === 'all' || (calendarId !== undefined && Array.isArray(down) && down.includes(calendarId)))
    throw new TypeError('Failed to fetch');
}

export const DEMO_CALENDARS: CalendarInfo[] = [
  { id: 'family@demo', name: 'Family', color: '#2D7F86', accessRole: 'owner', primary: true },
  { id: 'mamma@demo', name: "Mamma's calendar", color: '#C7A9D4', accessRole: 'reader', primary: false },
  { id: 'holidays@demo', name: 'Holidays in United States', color: '#408157', accessRole: 'reader', primary: false },
];

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const daily: Repeat = { every: 1, unit: 'day' };
const weekdays: Repeat = { every: 1, unit: 'week', weekdays: WEEKDAYS };
const t = (h: number, m = 0) => h * 60 + m;

function seed(): Master[] {
  const today = toISODate(new Date(currentTime()));
  const monday = addDays(today, -((new Date(currentTime()).getDay() + 6) % 7));
  const m = (
    id: string,
    title: string,
    day: ISODate,
    startMin: number,
    durMin: number,
    repeat?: Repeat,
    extra: Partial<Master> = {},
  ): Master => ({
    id,
    calendarId: 'family@demo',
    title,
    allDay: false,
    day,
    startMin,
    durMin,
    days: 1,
    repeat,
    exdates: [],
    overrides: {},
    ...extra,
  });
  const allDay = (id: string, title: string, day: ISODate, days: number, extra: Partial<Master> = {}): Master => ({
    id,
    calendarId: 'family@demo',
    title,
    allDay: true,
    day,
    startMin: 0,
    durMin: 0,
    days,
    exdates: [],
    overrides: {},
    ...extra,
  });
  const start = addDays(monday, -28);
  return [
    m('handwriting', 'Handwriting', start, t(10, 45), 15, weekdays),
    m('break1', 'Break', start, t(11), 15, weekdays),
    m('reading', 'Reading', start, t(11, 15), 30, weekdays),
    m('math', 'Math', start, t(11, 45), 30, weekdays),
    m('break2', 'Break', start, t(12, 15), 15, weekdays),
    m('science', 'Science', start, t(12, 30), 30, { every: 1, unit: 'week', weekdays: [1, 3, 4] }),
    m('quran-prep', 'Quran class prep', start, t(13), 30, { every: 1, unit: 'week', weekdays: [4] }),
    m('quran', 'Quran class', start, t(13, 45), 60, { every: 1, unit: 'week', weekdays: [4, 6] }),
    m('nap', 'Nap', start, t(15), 60, daily),
    m('islamic', 'Islamic Studies', start, t(17), 45, weekdays),
    m('prep-dinner', 'Prep dinner', start, t(18), 60, daily),
    m('maghrib', 'Maghrib', start, t(17, 45), 10, daily),
    m('dinner', 'Dinner', start, t(19, 45), 45, daily),
    m('night', 'Night time routine', start, t(20, 45), 45, daily),
    m('isha', 'Isha', start, t(21, 35), 10, daily),
    m('dentist', 'Dentist', addDays(today, 2), t(16, 30), 60, undefined, { location: 'Smile Dental' }),
    m('swim', 'Swim lesson', addDays(monday, 5), t(9, 30), 45, { every: 1, unit: 'week' }),
    m('playdate', 'Playdate at the park', addDays(today, 1), t(10), 90),
    m('pt-meeting', 'Parent-teacher meeting', addDays(today, 3), t(15, 30), 30, undefined, {
      calendarId: 'mamma@demo',
      organizer: 'teacher@school.example',
    }),
    m('library', 'Library storytime', addDays(today, 4), t(10, 30), 60, undefined, { calendarId: 'mamma@demo' }),
    m('book-club', 'Book club', addDays(today, 6), t(19), 90, undefined, { calendarId: 'mamma@demo' }),
    allDay('grandma', 'Grandma visiting', addDays(today, 8), 4),
    allDay('birthday', "Hashim's birthday", addDays(today, 12), 1),
    allDay('trip', 'Camping trip', addDays(today, 19), 3),
    allDay('holiday-1', 'Veterans Day', '2026-11-11', 1, { calendarId: 'holidays@demo' }),
    allDay('holiday-2', 'Thanksgiving Day', '2026-11-26', 1, { calendarId: 'holidays@demo' }),
    allDay('holiday-3', 'Christmas Day', '2026-12-25', 1, { calendarId: 'holidays@demo' }),
  ];
}

function load(): Master[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Master[];
  } catch {
    /* fall through to a fresh seed */
  }
  const s = seed();
  save(s);
  return s;
}

function save(ms: Master[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ms));
  } catch {
    /* storage unavailable: demo data lives for this page only */
  }
}

export function resetDemoCalendar(): void {
  save(seed());
}

const instanceId = (masterId: string, day: ISODate) => `${masterId}_${day.replace(/-/g, '')}`;
const parseInstance = (id: string) => {
  const i = id.lastIndexOf('_');
  const d = id.slice(i + 1);
  return { masterId: id.slice(0, i), day: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` };
};

function occurrence(ms: Master, day: ISODate, recurring: boolean): CalEvent {
  const o = ms.overrides[day] ?? {};
  const d = o.day ?? day;
  const id = recurring ? instanceId(ms.id, day) : ms.id;
  const startMin = o.startMin ?? ms.startMin;
  const start = ms.allDay ? dateAt(d) : dateAt(d, minutesToHHMM(startMin));
  const end = ms.allDay ? dateAt(addDays(d, ms.days)) : new Date(start.getTime() + (o.durMin ?? ms.durMin) * 60_000);
  const cal = DEMO_CALENDARS.find((c) => c.id === ms.calendarId)!;
  return {
    key: eventKey(ms.calendarId, id),
    calendarId: ms.calendarId,
    id,
    seriesId: recurring ? ms.id : undefined,
    originalStart: recurring ? (ms.allDay ? dateAt(day) : dateAt(day, minutesToHHMM(ms.startMin))) : undefined,
    title: o.title ?? ms.title,
    allDay: ms.allDay,
    start,
    end,
    location: ms.location,
    description: ms.description,
    organizer: ms.organizer,
    ...(cal.accessRole === 'owner' || cal.accessRole === 'writer'
      ? { editable: true }
      : { editable: false, readOnly: 'calendar' as const }),
    reminderMinutes: ms.reminderMinutes,
  };
}

function fromDraft(id: string, calendarId: string, d: EventDraft): Master {
  const day = d.allDay ? (d.firstDay ?? toISODate(d.start)) : toISODate(d.start);
  return {
    id,
    calendarId,
    title: d.title,
    allDay: d.allDay,
    day,
    startMin: d.allDay ? 0 : minutesOfDay(d.start),
    durMin: d.allDay ? 0 : Math.max(5, Math.round((d.end.getTime() - d.start.getTime()) / 60_000)),
    days: d.allDay ? diffDays(day, d.lastDay ?? day) + 1 : 1,
    repeat: d.repeat,
    exdates: [],
    overrides: {},
    location: d.location,
    description: d.description,
    reminderMinutes: d.reminderMinutes,
  };
}

export const fakeSource: CalendarSource = {
  async listCalendars() {
    reach();
    return DEMO_CALENDARS;
  },

  async listEvents(calendarId, timeMin, timeMax) {
    reach(calendarId);
    const from = toISODate(timeMin);
    const to = toISODate(timeMax);
    const out: CalEvent[] = [];
    for (const ms of load()) {
      if (ms.calendarId !== calendarId) continue;
      if (!ms.repeat) {
        const ev = occurrence(ms, ms.day, false);
        if (ev.end > timeMin && ev.start < timeMax) out.push(ev);
        continue;
      }
      for (let d = from > ms.day ? addDays(from, -7) : ms.day; d <= to; d = addDays(d, 1)) {
        if (!occursOn(ms.repeat, ms.day, d) || ms.exdates.includes(d)) continue;
        const ev = occurrence(ms, d, true);
        if (ev.end > timeMin && ev.start < timeMax) out.push(ev);
      }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  },

  async nextOccurrence(calendarId, id, after) {
    reach(calendarId);
    const { masterId, day } = /_\d{8}$/.test(id) ? parseInstance(id) : { masterId: id, day: null };
    const ms = load().find((x) => x.id === masterId && x.calendarId === calendarId);
    if (!ms) return null;
    if (!ms.repeat) {
      const ev = occurrence(ms, ms.day, false);
      return ev.end > after ? ev : null;
    }
    if (day) {
      const ev = occurrence(ms, day, true);
      return ev.end > after ? ev : null;
    }
    const from = toISODate(after) > ms.day ? toISODate(after) : ms.day;
    for (let d = from, n = 0; n < 800; d = addDays(d, 1), n++) {
      if (!occursOn(ms.repeat, ms.day, d) || ms.exdates.includes(d)) continue;
      const ev = occurrence(ms, d, true);
      if (ev.end > after) return ev;
    }
    return null;
  },

  async seriesRecurrence(calendarId, seriesId) {
    reach(calendarId);
    const ms = load().find((x) => x.id === seriesId);
    return ms?.repeat ? [toRRule(ms.repeat, ms.allDay)] : [];
  },

  async insert(calendarId, id, draft) {
    reach(calendarId);
    const ms = load().filter((x) => x.id !== id);
    ms.push(fromDraft(id, calendarId, draft));
    save(ms);
  },

  async update(ev, draft, scope) {
    reach(ev.calendarId);
    const ms = load();
    const masterId = ev.seriesId ?? ev.id;
    const i = ms.findIndex((x) => x.id === masterId);
    if (i < 0) throw new Error('demo calendar: event not found');
    const master = ms[i];
    const next = fromDraft(master.id, master.calendarId, draft);
    // Where the series has this occurrence, even when it was moved.
    const orig = toISODate(ev.originalStart ?? ev.start);
    if (!ev.seriesId) {
      ms[i] = { ...master, ...next, repeat: draft.keepRecurrence ? master.repeat : next.repeat };
    } else if (scope === 'this') {
      const { day } = parseInstance(ev.id);
      master.overrides[day] = { title: next.title, day: next.day, startMin: next.startMin, durMin: next.durMin };
    } else if (scope === 'following' && master.day < orig) {
      const kept = master.repeat;
      master.repeat = { ...master.repeat!, until: addDays(orig, -1) };
      const id = `ev${Math.random().toString(36).slice(2, 10)}`;
      ms.push({ ...next, id, repeat: draft.keepRecurrence ? kept && shiftRepeat(kept, diffDays(orig, next.day)) : next.repeat });
      save(ms);
      return { newSeriesId: id };
    } else {
      const shift = diffDays(toISODate(ev.start), next.day);
      ms[i] = {
        ...master,
        ...next,
        day: addDays(master.day, shift),
        // Moved to another weekday: a weekly rule's days move with it.
        repeat: draft.keepRecurrence ? master.repeat && shiftRepeat(master.repeat, shift) : next.repeat,
        overrides: {},
      };
    }
    save(ms);
    return {};
  },

  async remove(ev, scope) {
    reach(ev.calendarId);
    let ms = load();
    const masterId = ev.seriesId ?? ev.id;
    const master = ms.find((x) => x.id === masterId);
    if (!master) return;
    const orig = toISODate(ev.originalStart ?? ev.start);
    if (!ev.seriesId || scope === 'all' || (scope === 'following' && master.day >= orig)) {
      ms = ms.filter((x) => x.id !== masterId);
    } else if (scope === 'this') {
      master.exdates.push(parseInstance(ev.id).day);
    } else {
      master.repeat = { ...master.repeat!, until: addDays(orig, -1) };
    }
    save(ms);
  },
};
