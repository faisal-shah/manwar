import type { PhonePage } from './nav';
import { todayPage } from './today';
import { tasksPage } from './tasks';
import { listsPage } from './lists';
import { calendarPage } from './calendar';
import { morePage } from './more';

/** The phone's bottom tabs, in order. */
export const PHONE_PAGES: PhonePage[] = [todayPage, tasksPage, listsPage, calendarPage, morePage];
