# 04 — UI gallery, visual design and interaction (Skylight Calendar 2 + Plus)

Real screens of the on-device UI and the companion app, captured from
YouTube footage (2025-2026) and the App Store / Google Play listings, with a
description precise enough to rebuild the layout and feel at 1920x1080.

- Frames: `assets/frames/<video-slug>/<mmss>-<what-it-shows>.jpg` (149 frames,
  1280x720 JPEG, q3). `<mmss>` is the timestamp in the source video.
- Store screenshots: `assets/appstore/` (37 files, full resolution).
- The user's own device photos are in `assets/user-device/` and described in
  [00-user-device.md](00-user-device.md). They show the same software
  generation as the newest Calendar 2 footage (see
  [Differences from the user's photos](#differences-between-the-users-photos-and-calendar-2-footage)).
- Hex values marked "render" are sampled from Skylight's own App Store
  marketing render (`assets/appstore/ios-ipad-01-hero-device-render-crop.jpg`)
  and are exact for that render. Values marked "est." are estimates from
  camera footage, which shifts white balance; treat them as targets to tune.
- Pixel sizes are estimated at 1920x1080 by scaling frontal frames
  (`livjowen-2026-04/0836`, `user-device/calendar-schedule-4day.jpg`).

Out of scope and only mentioned where they touch the chrome: Disney Mode,
Magic Import / Sidekick, Photo Screensaver.

## Contents

1. [Video sources](#video-sources)
2. [UI generations seen in footage](#ui-generations-seen-in-footage)
3. [Global chrome and layout grid](#global-chrome-and-layout-grid)
4. [Home dashboard](#home-dashboard)
5. [Calendar](#calendar)
6. [Event detail, create and edit](#event-detail-create-and-edit)
7. [Tasks (chores and routines)](#tasks-chores-and-routines)
8. [Completion feedback and celebrations](#completion-feedback-and-celebrations)
9. [Rewards](#rewards)
10. [Lists](#lists)
11. [Meals](#meals)
12. [Recipes](#recipes)
13. [Settings](#settings)
14. [Sleep, idle and screensaver clock](#sleep-idle-and-screensaver-clock)
15. [Setup and onboarding screens](#setup-and-onboarding-screens)
16. [Portrait orientation](#portrait-orientation)
17. [Design system summary](#design-system-summary)
18. [Interaction catalog](#interaction-catalog)
19. [Companion app](#companion-app)
20. [Differences between the user's photos and Calendar 2 footage](#differences-between-the-users-photos-and-calendar-2-footage)
21. [Open questions and gaps](#open-questions-and-gaps)

## Video sources

Frames were kept from 12 videos. "Device date" is the date shown on the
device's own clock in the footage, which dates the software build more
reliably than the upload date.

| Slug (frame folder) | Title | Channel | URL | Upload | Device date | Hardware | What it covers |
|---|---|---|---|---|---|---|---|
| `everymom-2026-10` | Skylight Calendar 2 + Buddy Review: Worth the Money? | The Everymom | https://www.youtube.com/watch?v=O4e7y5ajdNA | 2026-10-21 | Wed Aug 19 (2026) | Calendar 2 15", white | Newest UI: Home dashboard, week view with meal badges, countdown strip, Add Event sheet, Up for Grabs tasks, first-star dialog, reward celebration, lists + keyboard, meals, recipes, Settings General/Display, photos, screensaver clock |
| `gregsgadgets-2026-06` | How Skylight Calendar 2 Organizes My Entire Life | GregsGadgets | https://www.youtube.com/watch?v=wqt2ISb-lFg | 2026-06-28 | Wed Jun 17 2026 | Calendar 2 15", charcoal | Home dashboard (green background), day view, week view popovers, task undo toast, meals grid |
| `stephanie-2026-05` | (Review) What to know BEFORE you buy the Skylight Calendar 2 | Stephanie | https://www.youtube.com/watch?v=9vF1XR98nOw | 2026-05-24 | Mon Apr 27 2026 | Calendar 2 15", black shadow box | Week, month, day, schedule views; lists; tasks day and week; rewards; meals; recipes; photos |
| `properhonesttech-2026-04` | Digital Calendar for Families: Is the Skylight Calendar 2 Worth It? | Proper Honest Tech | https://www.youtube.com/watch?v=jgxOqL3md3A | 2026-04-30 | Tue Apr 28 (2026) | Calendar 2 15", white | Schedule view, event popover, Edit Event sheet, time picker, view menu, week view, compact tasks, task popover, settings, meals, recipes, app screens |
| `techfowler-2026-04` | Is The SKYLIGHT Digital Calendar 2 WORTH IT? | Tech Fowler | https://www.youtube.com/watch?v=Xa527GGZgIQ | 2026-04-30 | Wed Apr 15 (2026) | Calendar 2 15", white | Portrait mode, month with Add Countdown, compact tasks, lists, app home and meal form |
| `livjowen-2026-04` | Skylight Calendar Setup Tutorial / Get Your Family Organized FAST | Liv J Owen | https://www.youtube.com/watch?v=F-g4Qqk9yRk | 2026-04-02 | Thu Mar 26 (2026) | Calendar 2 15", white | Clearest frontal footage: Add Event sheet + keyboard, countdown, event popover, task completion states, all-done celebration, task filter, rewards states, meal planning flow, lists, recipes |
| `nickbradley-2025-12` | Is The Skylight Digital Calendar Worth It? (2 Week Family Test) | Nick Bradley | https://www.youtube.com/watch?v=xM0MZwsKJ8Y | 2025-12-22 | Dec 2025 | Calendar 15" (original) | 7-day schedule, multi-profile stripes, calendar filter menu, view menu, event weather, month meal pills, task recurrence picker, lists, app grocery list |
| `kerischoof-2025-12` | How to Set Up Skylight Calendar / Full Tutorial & Basic vs Plus Features | Keri Schoof | https://www.youtube.com/watch?v=oYlIPo7Emzc | 2025-12-17 | Dec 13 2025 | Calendar 15" | Settings > Calendar, week view with meals, late chores, all-done message, app in dark mode |
| `andruedwards-2025-12` | Could a 15-Inch Skylight Calendar Replace Every Family Calendar App? | Andru Edwards | https://www.youtube.com/watch?v=CvhTfgEonMI | 2025-12-05 | Feb 2025 and Nov 19 2025 | Calendar 15" | Screensaver clock, 2025 filter popover, month with countdown + progress strip |
| `skylight-setup-2025-07` | Watch Me Unbox and Set Up My Skylight Calendar From Scratch | Skylight (official) | https://www.youtube.com/watch?v=JtEwOeiP0nE | 2025-07-18 | Wed Jul 2 2025 | Calendar 15" | Onboarding (Wi-Fi, activation, time zone), 2025 schedule UI, filter, Edit Profile, Add Task + emoji picker, rewards redeem, 2025 meals |
| `skylight-chores-2025-04` | The Ultimate Hack to Making Chores Fun for Kiddos | Skylight (official) | https://www.youtube.com/watch?v=YtpYZ2UzAyQ | 2025-04-24 | Thu Feb 27 2025 | Calendar 15" | 2025 rewards columns, Add Chore modal, portrait tasks, redeem star burst |
| `skylight-meals-2025-04` | Meal Planning with Skylight Calendar and Calendar Plus | Skylight (official) | https://www.youtube.com/watch?v=Ggv-NHXM3kw | 2025-04-24 | Mar 2025 | Calendar 15" | Select Dinner panel, portrait meals, floating grocery list |

Also downloaded and reviewed via contact sheets, no unique screens kept:
`yJ6LgSU1cuE` (Skylight, Get to Know Skylight Calendar, 2025-04),
`IXpGdqgJb6Q` (Skylight Plus Master Class, 2025-01, mostly phone app),
`N4xiLjL7bhg` (ManShed, 2026-06, B-roll), `N1yK3VicJGo` (TT Technology,
2026-08), `vCFI8A6Axec` (Stephen Robles, 2025-10), `cZZ1mdKGbsU` (Skylight
Buddy), `bfCLkJZuBog` (Best Buy, grocery list, 49 s). Their captions were
used for interaction details where cited. Videos and captions live in the
session scratch directory, not in the repo.

## UI generations seen in footage

The software changed visibly between early 2025 and mid 2026. Build against
generation C; older frames are kept because they show screens (dialogs,
celebrations) that did not change, and are labelled `-2025` where the look is
outdated.

```mermaid
timeline
    title On-device UI generations (dated by device clock in footage)
    Feb-Jul 2025 (A) : Nav Calendar, Chores/Tasks, Rewards, Meals, Photos, Lists, Sleep, Settings
                     : "Magic Import" dropdown in top bar
                     : Event detail and Add Chore as centered modals
                     : Meals tab has a right "Recipe Box" panel, no Recipes tab
    Dec 2025-Apr 2026 (B) : Nav Calendar, Lists, Tasks, Rewards, Meals, Recipes, Photos, Sleep, Settings
                          : Editors become right-side sheets
                          : Profile progress strip and countdown strip under the top bar
                          : Up for Grabs task column (Apr 2026)
    Jun-Nov 2026 (C) : "S Home" dashboard tab added above Calendar
                     : Home cards Calendar, Today's Tasks, Lists with Customize
                     : User's own device (Nov 4 2026) is this generation
```

Evidence: generation A nav in
`skylight-setup-2025-07/0948-schedule-view-populated.jpg` and
`skylight-chores-2025-04/0036-rewards-columns-2025.jpg` (tab still named
"Chores"); "Feature Update: Chores are now located under the Tasks tab"
banner at `YtpYZ2UzAyQ` 00:24. Generation B nav with unlabeled `S` logo in
`livjowen-2026-04/0225-add-event-a.jpg` and
`stephanie-2026-05/0250-tasks-week-habit-grid.jpg`. Generation C `S Home`
label in `gregsgadgets-2026-06/0052-home-header-closeup.jpg`,
`everymom-2026-10/0209-home-dashboard.jpg` and the user's
`user-device/calendar-schedule-4day.jpg`.

## Global chrome and layout grid

![Week view, generation B, frontal](assets/frames/livjowen-2026-04/0836-task-tap-complete.jpg)

![User's device, generation C](assets/user-device/calendar-schedule-4day.jpg)

### Layout at 1920x1080 (landscape)

```text
+------+------------------------------------------------------------------+
| S    | Wed, Nov 4  11:44 AM  [sun] 74°  (!)        [Schedule v][Filter] |  top bar ~88 px
| Home |                                                     [<][Today][>]|
+------+------------------------------------------------------------------+
| Cal  | (A) Asiyah 0/19 | (B) Baba 0/6 | (H) Hashim 0/19 | (M) Mamma 0/13 |  strip ~44-52 px
| Lists|------------------------------------------------------------------|
| Tasks| view body (time grid / week cells / month / columns)             |
| Rew. |                                                                  |
| Meals|                                                                  |
| Recip|                                                                  |
| Photo|                                                                  |
|      |                                                                  |
| Sleep|                                                            (+)   |  FAB ~64-100 px
| Sett.|                                                                  |
+------+------------------------------------------------------------------+
 ~96 px
```

- **Nav rail**: full height, ~96 px wide (5% of width), slightly cooler and
  darker than the content (render `#E9F0F8`). Each item is an outline icon
  (~32 px) above a small sans label (~15-16 px), stacked from the top. The
  selected item sits on a lighter rounded tile that runs to the rail's right
  edge (render: white tile). Sleep and Settings are pinned to the bottom.
  Order (generation C): `S`/Home, Calendar, Lists, Tasks, Rewards, Meals,
  Recipes, Photos ... Sleep, Settings
  (`gregsgadgets-2026-06/0100-home-dashboard-green.jpg`,
  `everymom-2026-10/0209-home-dashboard.jpg`). The S logo is a serif capital.
- **Top bar**: left-aligned serif date `Wed, Nov 4`, then time `11:44 AM`
  (slightly smaller), then a weather icon and temperature with a degree sign
  and no unit letter. Some builds show a circled `!` after the temperature
  (`livjowen-2026-04/0836-task-tap-complete.jpg`,
  `gregsgadgets-2026-06/0052-home-header-closeup.jpg`); meaning not stated.
  The date can be replaced by the calendar's display name
  (`Miller Family 11:20 AM` in the render, `Family Calendar` in
  `nickbradley-2025-12/0001-schedule-7day-overview.jpg`, `Keri` in
  `kerischoof-2025-12/0320-week-view-and-app-home-dark.jpg`), set in
  Settings > Calendar > Calendar display name
  (`properhonesttech-2026-04/0344-settings-calendar-week-start.jpg`).
  When navigated away from today the left text becomes the period:
  `June 2026` (`gregsgadgets-2026-06/0424-week-view-green-event-popover.jpg`)
  or `Fri, Jun 12, 2026` with year and no time in Day view
  (`gregsgadgets-2026-06/0028-day-view-minimonth-green.jpg`).
- **Top bar, right** (per tab):
  - Calendar: `View ▾` dropdown labelled with the current view, `Filter`
    (eye-slash icon), `<`, `Today`, `>`
    (`user-device/calendar-schedule-4day.jpg`,
    `livjowen-2026-04/0301-month-countdown-banner.jpg`). Generation A also had
    a `Magic Import ▾` dropdown with a yellow "Try" badge
    (`skylight-meals-2025-04/0258-grocery-list-floating-panel-2025.jpg`).
  - Tasks: `Day | Week` segmented pill (selected = outlined pill), `Filter ▾`,
    `<`, `Today` (`This Week` in Week mode), `>`
    (`stephanie-2026-05/0250-tasks-week-habit-grid.jpg`,
    `properhonesttech-2026-04/0512-tasks-day-reorder-toast.jpg`).
  - Rewards: `Hide redeemed` with an eye-slash icon
    (`skylight-chores-2025-04/0036-rewards-columns-2025.jpg`).
  - Meals: `Filter`/`Categories ▾`, `<`, `Today`, `>`
    (`properhonesttech-2026-04/0656-meals-grid-week.jpg`).
  - Home: `Customize` with a grid icon
    (`everymom-2026-10/0209-home-dashboard.jpg`).
  - Controls are low-contrast text buttons or very light pills; nothing in the
    chrome is saturated.
- **Profile progress strip** (Calendar and Home): one pill per profile,
  equal widths filling the row, ~44-52 px tall. Each pill: avatar circle
  (initial or photo) + name + `done/total` tasks today. The pill background
  is a light tint of the profile color and a mid tint fills from the left in
  proportion to completion (render: `#E1EFEF` track, `#ACD6D7` fill for teal;
  `properhonesttech-2026-04/0216-schedule-4day-progress-strip.jpg` shows
  `Tom 1/4` a quarter filled). A completed profile shows a check instead of
  the count (`Greg ✓`, `gregsgadgets-2026-06/0028-day-view-minimonth-green.jpg`).
  Toggle: Filter menu > `Tasks progress`
  (`nickbradley-2025-12/0020-calendar-filter-menu-tasks-countdowns.jpg`).
- **Countdown strip**: countdown pills share the strip (left of the profile
  pills) or take their own row: `Christmas 36 days`
  (`andruedwards-2025-12/0240-month-countdown-progress-strip.jpg`),
  `Milo's Birthday Today!` (cake emoji first) as a full-width bar
  (`livjowen-2026-04/0301-month-countdown-banner.jpg`), and in generation C
  `Family Game Night 2 days`, `Cabin 8 days` with diagonal stripes of the
  attending profiles' colors
  (`everymom-2026-10/0225-month-countdown-strip-app-edit-profile.jpg`).
  With no countdowns, an `Add Countdown` pill appears under the top bar
  (`techfowler-2026-04/0130-month-view-add-countdown.jpg`). Toggle: Filter
  menu > `Countdowns`.
- **FAB**: solid blue circle with a white `+`, bottom-right, ~16-24 px from
  the edges, on every tab (all frames). Size varies with the Display density
  setting: ~100 px in `livjowen-2026-04/0836-task-tap-complete.jpg`, ~70 px
  on the user's denser device.
- **Background**: a soft vertical/diagonal gradient. Most 2026 devices show a
  pale blue to teal-grey wash (`user-device/calendar-schedule-4day.jpg`,
  `properhonesttech-2026-04/0216-schedule-4day-progress-strip.jpg`); one shows
  mint/sage green (`gregsgadgets-2026-06/0100-home-dashboard-green.jpg`).
  Surfaces on top (columns, cards, popovers) are white at 50-80% opacity, so
  the wash shows through. The App Store render uses plain white.
- **Toasts**: dark charcoal rounded rectangle, bottom-left, white sans text,
  light-blue action word: `Long press profiles to reorder. Close`
  (`properhonesttech-2026-04/0512-tasks-day-reorder-toast.jpg`),
  `Laundry (Jun 14) completed. Undo`
  (`gregsgadgets-2026-06/0528-tasks-day-green-undo-toast.jpg`),
  `Screensaver is paused while you're in Recipes. Close`
  (`properhonesttech-2026-04/0704-recipes-detail-screensaver-toast.jpg`).

## Home dashboard

Generation C only. A three-card dashboard.

![Home dashboard, empty tasks](assets/frames/everymom-2026-10/0209-home-dashboard.jpg)
![Home dashboard, populated, green background](assets/frames/gregsgadgets-2026-06/0100-home-dashboard-green.jpg)
![Home cards close-up](assets/frames/gregsgadgets-2026-06/0056-home-tasks-card-closeup.jpg)
![Home header close-up](assets/frames/gregsgadgets-2026-06/0052-home-header-closeup.jpg)
![Home dashboard, populated, meal badges and completed tasks](assets/frames/everymom-2026-10/0255-home-dashboard-closeup.jpg)

- Left card `CALENDAR` (~half the content width, full height): small-caps
  card title with calendar icon, its own `Week ▾`, `<`, `Today`, `>`
  controls, and the 8-cell week layout (see Week view).
- Right column, two stacked cards: `TODAY'S TASKS` (with `<` `>` paging
  between groups of profiles) and `LISTS` (with `<` `>` paging between
  lists). Card titles are small uppercase sans with an icon.
- Today's Tasks shows mini profile columns: avatar, serif name, `✓ 1/2`
  progress bar, then compact task rows (emoji + title + white circle). A
  completed row fills with the profile color and shows a white check in a
  darker circle (`Gym` row, `gregsgadgets-2026-06/0056-home-tasks-card-closeup.jpg`).
- Lists shows two list columns side by side: serif list name, colored count
  badge, `Add item` input row, sections (`Dairy ^ +`), items with square
  checkboxes (`everymom-2026-10/0255-home-dashboard-closeup.jpg`).
- In the populated calendar card each day cell lists meal pills with their
  category badge (`Eggs [Breakfast]`, `Wraps [Lunch]`, `Tacos [Dinner]`)
  above the events (`everymom-2026-10/0255-home-dashboard-closeup.jpg`).
- Empty state for tasks: illustration of the device, `Tasks` serif title,
  three icon bullets (`Establish routines.` `Keep track of chores.`
  `Build healthy habits.`) and an `Add a Profile to Get Started` pill
  (`everymom-2026-10/0209-home-dashboard.jpg`,
  `everymom-2026-10/0210-home-dashboard-empty-tasks.jpg`).
- `Customize` (top-right) presumably reorders/hides cards; not shown in
  footage.

## Calendar

Four views, chosen from the `View ▾` dropdown: a light popover listing
`Schedule`, `Day`, `Week`, `Month`, each row with a radio dot; the selected
row is outlined (`properhonesttech-2026-04/0120-schedule-view-dropdown-open.jpg`,
`nickbradley-2025-12/0145-view-dropdown-over-day-view.jpg`).

### Schedule view (multi-day time grid)

![Schedule, 4 days, progress strip, multi-profile split](assets/frames/properhonesttech-2026-04/0216-schedule-4day-progress-strip.jpg)
![Schedule, 7 days, photo avatars](assets/frames/nickbradley-2025-12/0001-schedule-7day-overview.jpg)
![Schedule close-up](assets/frames/nickbradley-2025-12/0050-schedule-view-closeup.jpg)
![Multi-profile stripes](assets/frames/nickbradley-2025-12/0057-schedule-multiprofile-stripes.jpg)
![Meals row under day headers](assets/frames/nickbradley-2025-12/0201-schedule-header-meals-row.jpg)
![Official render of the schedule grid](assets/appstore/ios-ipad-01-hero-device-render-crop.jpg)
![Schedule, Stephanie](assets/frames/stephanie-2026-05/0201-schedule-view-timegrid.jpg)

- N day columns, N set by Settings > Calendar > Schedule view > `Days
  displayed` slider, and `Start on current day` toggle
  (`kerischoof-2025-12/0403-settings-calendar-days-slider.jpg`). Seen with 4
  days (user photo, `properhonesttech-2026-04/0216`), 7 days
  (`nickbradley-2025-12/0001`), 3 days (Stephen Robles narration: "schedule
  view, which is the next three days", `vCFI8A6Axec` 03:20).
- Hour labels in a ~90 px left gutter (`11 AM`, `12 PM`; grey sans, render
  `#676767`); faint hour lines; ~64-68 px per hour on the user's device.
  The grid scrolls vertically and opens near the current time; pinch zooms
  the hour height (official setup narration at `JtEwOeiP0nE` 13:10-13:20;
  `skylight-setup-2025-07/1217-schedule-zoomed-pinch.jpg`).
- Day header: serif weekday + date (`Wed 29`), today's date number in a
  filled red/coral circle with a white numeral (render `#F06C53`), daily
  weather icon right-aligned in the header (user photo). No column shading
  for today.
- All-day row directly under the headers: all-day events as thin rounded
  bars (render: light tint `#D3ECD4` green bar `Camping Trip`); meals as
  outlined white pills (`Rice Bowl`, `Pasta Bolognese`,
  `nickbradley-2025-12/0201-schedule-header-meals-row.jpg`; `Chips`, `Fruit`
  on the user's device).
- Timed event block: filled rounded rectangle (~8 px radius), title in
  semibold sans at top-left, time range below in a darker shade of the fill
  (render: title `#000708`, time `#466061` on `#B3DAD9`), profile avatar
  (24-28 px photo or initial circle) at the right. Overlapping events split
  the column into equal side-by-side lanes. Very short events become thin
  bars with clipped text (user photo).
- Multi-profile events: when Settings > `Color code multi-profile events` is
  on, the block is split diagonally into bands of each profile color, with
  one avatar per profile (`nickbradley-2025-12/0057`,
  `properhonesttech-2026-04/0216` yellow/teal split,
  `everymom-2026-10/0402-schedule-multiday-event-popover.jpg`).
- Current time: thin red line across today's column only, with a filled dot
  at its left end (render; user photo; `properhonesttech-2026-04/0216`).

### Day view

![Day view with mini month](assets/frames/gregsgadgets-2026-06/0028-day-view-minimonth-green.jpg)
![Day view, older](assets/frames/stephanie-2026-05/0153-day-view.jpg)

- Two panes: left ~30% a mini month (`June 2026` serif title, S-M-T-W-T-F-S
  header, today in a red circle); right ~70% an agenda list for the selected
  day: full-width rounded rows tinted in the event's profile color with
  title + time and avatar at the right
  (`gregsgadgets-2026-06/0028-day-view-minimonth-green.jpg`).
- Meals for the day appear as outlined pills with a category badge
  (`Dinner`) at the top of the list
  (`nickbradley-2025-12/0145-view-dropdown-over-day-view.jpg`).

### Week view (8-cell grid)

![Week view, 8 cells](assets/frames/properhonesttech-2026-04/0328-week-view-8cell.jpg)
![Week view with meal badges and weather](assets/frames/everymom-2026-10/0046-week-view-meal-badges.jpg)
![Week view, black frame](assets/frames/stephanie-2026-05/0016-week-view-8cell.jpg)
![Week view with meals (generation B)](assets/frames/kerischoof-2025-12/0320-week-view-and-app-home-dark.jpg)

- Not a time grid: a 4x2 grid of day cards. Seven cells for the days plus an
  8th cell `Next Week` with the next week's date range (`May 4 - 10`,
  `August 26 - September 1`) as a jump target.
- Cell header: serif `Mon 27` (today in a red circle), grey `7 events` line,
  a weather icon, and `+ Add Event` at the right.
- Cell body: stacked event cards (title, time, avatar right), meal pills
  (outlined, with a colored category badge: Breakfast teal, Lunch red,
  Dinner purple, Snack orange in `everymom-2026-10/0046`), and in some builds
  a peach weather pill `47°/81° All day` as the first item
  (`stephanie-2026-05/0016-week-view-8cell.jpg`). Overflow scrolls inside the
  cell.
- With Settings > Week view > `Start on current day`, the first cell is
  today instead of Sunday/Monday (`kerischoof-2025-12/0340-settings-calendar.jpg`;
  narration at `oYlIPo7Emzc` 03:30-03:50).

### Month view

![Month view, generation B](assets/frames/livjowen-2026-04/0301-month-countdown-banner.jpg)
![Month view with meal pills](assets/frames/techfowler-2026-04/0500-month-view-meal-pills.jpg)
![Month, past days dimmed](assets/frames/stephanie-2026-05/0138-month-view.jpg)
![Month close-up](assets/frames/nickbradley-2025-12/0217-month-closeup-meal-pills.jpg)

- 7 columns, weekday headers in large serif (`Sun`, `Mon`), 5-6 week rows,
  thin cell dividers, date number top-right of each cell (`Mar 1` for the
  first of a month, `Apr 1` across the boundary), today in a red circle.
- Event chips: single-line rounded pills fully filled in the profile color,
  small time prefix then title (`3 PM Soccer Practice`); multi-day events as
  bars spanning cells (`stephanie-2026-05/0138-month-view.jpg`); overflow as
  grey `2 more` / `4 more` text. Meals as outlined pills.
- `Dim past events` greys out past days and events
  (`stephanie-2026-05/0138-month-view.jpg`; narration "Anything in the month
  that is previously happened is grayed out", `9vF1XR98nOw` 01:40).

### Filter popover

![Filter menu: Tasks progress, Countdowns, Events](assets/frames/nickbradley-2025-12/0020-calendar-filter-menu-tasks-countdowns.jpg)
![Filter, generation A](assets/frames/skylight-setup-2025-07/1232-filter-popover.jpg)
![Filter rows with edit pencils](assets/frames/andruedwards-2025-12/0136-schedule-filter-popover-2025ui.jpg)
![Filtered to one profile](assets/frames/skylight-setup-2025-07/1247-schedule-filtered-one-profile.jpg)

- Anchored under `Filter`, white rounded card. Sections: `Tasks progress`
  toggle, `Countdowns` toggle, then `Events` with `Select All` and one row
  per profile (colored dot/avatar, name, pencil to edit the profile, toggle).
- Unchecking profiles hides their events immediately; the narration
  describes deselecting all, then toggling one back on
  (`JtEwOeiP0nE` 12:20-12:50).

## Event detail, create and edit

![Event popover](assets/frames/properhonesttech-2026-04/0041-schedule-event-popover.jpg)
![Event popover, countdown event](assets/frames/livjowen-2026-04/0302-event-detail-popover.jpg)
![Recurring event popover](assets/frames/gregsgadgets-2026-06/0504-week-view-green-recurring-popover.jpg)
![Event with location weather](assets/frames/nickbradley-2025-12/0209-event-location-weather.jpg)
![Multi-day, multi-profile popover](assets/frames/everymom-2026-10/0402-schedule-multiday-event-popover.jpg)
![Generation A event modal](assets/frames/skylight-setup-2025-07/1132-event-detail-modal-2025.jpg)

**Detail popover** (tap an event): a floating white card (~460 px wide,
~24 px radius, soft shadow) anchored next to the tapped event, not a
full-screen sheet. Content: event emoji (if any) + serif title (~32 px),
pencil and red trash icons top-right; icon rows: countdown (`Today` /
`8 days until event`), date and time (`Thursday, Mar 26 : All day`), repeat
rule (`Yearly on March 26`, `Monthly`, `Weekly on Fri until Dec 14, 2025`),
collapsible `Profiles` list with avatars, `Synced calendar` with the source
calendar name and provider icon, location address, and a weather line for
located events (`76° Clear Sky, High 78 Low 75, Wind`). Tap outside to
dismiss. Generation A used a centered modal with `Delete Event` (red) and
`Edit Event` buttons.

![Add Event sheet](assets/frames/livjowen-2026-04/0225-add-event-a.jpg)
![Add Event sheet, profiles](assets/frames/livjowen-2026-04/0233-add-event-b.jpg)
![Add Event with keyboard](assets/frames/livjowen-2026-04/0257-add-event-keyboard.jpg)
![Edit Event sheet](assets/frames/properhonesttech-2026-04/0044-edit-event-sheet.jpg)
![Time picker dialog](assets/frames/properhonesttech-2026-04/0048-edit-event-time-picker-dialog.jpg)
![Add Event with Sidekick tabs](assets/frames/everymom-2026-10/0145-add-event-magic-import-sheet.jpg)
![Add Event, Sidekick photo mode QR (out of scope)](assets/frames/everymom-2026-10/0142-add-event-magic-import-qr.jpg)

**Add / Edit Event sheet** (FAB `+` or pencil): a right-side sheet, ~30% of
the screen width, full height with rounded left corners; the rest of the
screen gets a grey scrim. Header `←  Add Event` / `Edit Event` (serif,
~40 px). Fields top to bottom, each a row with a leading outline icon:

1. `Title` (floating label, text field; focus outlines the field)
2. `All day` toggle
3. `Starts` date | `Starts` time (two columns), `Ends` date | `Until` time
4. `Repeats` toggle (expanded recurrence options not captured on the device;
   the task recurrence picker below is the closest)
5. `Countdown` toggle
6. `Reminder` dropdown
7. `Profiles`: grid of avatar circles (5 per row) with names under them,
   selected ones solid in their color, plus a `+` to add a profile
8. Full-width `Add` / `Save` pill pinned at the bottom, blue (pale until the
   form is valid).

Time fields open a Material-style analog clock dialog centered over a dark
scrim: large `12 : 00` hour/minute boxes (selected box blue), AM/PM toggle,
clock face with a blue hand, `Dismiss` / `Select` text buttons
(`properhonesttech-2026-04/0048`). The narration mentions dragging the clock
hand ("drag this little handle", `JtEwOeiP0nE` 18:20). The date picker was not
captured. In generation C the sheet starts with input-mode buttons
`Type / Photo / Talk / Email` (Sidekick; out of scope)
(`everymom-2026-10/0145`).

**On-screen keyboard**: full-width Android/Gboard-style keyboard, white keys
without borders, number hints above the top row, suggestion strip
(`Me | ! | More`), mic icon, green circular check as Enter, emoji key
bottom-right. It covers the bottom ~45% of the screen including the bottom of
the sheet (`livjowen-2026-04/0257-add-event-keyboard.jpg`,
`everymom-2026-10/0236-lists-add-item-keyboard.jpg`,
`skylight-setup-2025-07/0533-wifi-onscreen-keyboard.jpg`). Keyboard click
sounds can be turned off (Settings > General > `Keyboard clicks`,
`everymom-2026-10/0134-settings-display-parental-lock.jpg`).

## Tasks (chores and routines)

### Day view: one column per profile

![Tasks day view, emoji cards](assets/frames/livjowen-2026-04/0836-task-tap-complete.jpg)
![Tasks day view, compact cards and Up for Grabs](assets/frames/properhonesttech-2026-04/0128-tasks-day-compact-up-for-grabs.jpg)
![Tasks day columns, Stephanie](assets/frames/stephanie-2026-05/0258-tasks-day-columns.jpg)
![Compact rows](assets/frames/techfowler-2026-04/0050-tasks-day-compact-rows.jpg)
![Late chores](assets/frames/kerischoof-2025-12/0524-tasks-day-late-chores.jpg)
![Photo avatar and illustrated avatar](assets/frames/nickbradley-2025-12/0249-tasks-closeup-photo-avatar.jpg)
![Evening section, unicorn avatar](assets/frames/nickbradley-2025-12/0233-tasks-closeup-evening.jpg)
![Tasks with routines toast](assets/frames/everymom-2026-10/0204-tasks-day-routines-toast.jpg)
![Empty task columns, generation A](assets/frames/skylight-setup-2025-07/2102-tasks-empty-states-2025.jpg)
![User's tasks](assets/user-device/tasks-day-by-profile.jpg)

- One rounded, translucent column card per profile (~580 px wide at 3
  columns, `livjowen-2026-04/0836`; 4 columns fit on the user's device),
  12-20 px gaps. Columns scroll vertically independently. Profiles are
  reordered by long-press (toast `Long press profiles to reorder.`).
- Column header: avatar circle (~80 px at cozy density; initial in white on
  the profile color, a photo, or an illustrated animal avatar such as the
  unicorn in `nickbradley-2025-12/0233-tasks-closeup-evening.jpg` and the
  photo in `nickbradley-2025-12/0249-tasks-closeup-photo-avatar.jpg`),
  serif name (~36 px), a
  progress pill `✓ 2/9` whose fill grows in the profile color, and a star
  pill `★ 7` with the star balance (abbreviated `28.5K` on the user's device).
- Section shortcut row: circular outline buttons (~80 px) with an emoji-like
  icon and a label under each: `Morning` (sun behind cloud), `Afternoon`
  (sun), `Evening` (crescent moon), `Chores` (broom). Empty sections are
  omitted. As tasks in a section are completed, the circle's border becomes a
  progress ring in the profile color; when the section is done it shows a
  check (`livjowen-2026-04/0836`, `livjowen-2026-04/0848-profile-all-sections-done.jpg`).
  Tapping one jumps/filters to that section (`kerischoof-2025-12/0648-tasks-section-icon-tap.jpg`).
- Section header in serif (`Morning`).
- Task card with emoji: ~220 px tall at cozy density; large emoji (~64 px)
  centered in the upper half; title bottom-left in semibold sans
  (`01. Good Morning`; numbering is a user workaround because tasks sort
  alphabetically, narration `F-g4Qqk9yRk` 04:50-05:10); star value chip
  `☆ 1` under the title; white completion circle bottom-right; optional
  subtitle with repeat rule / time (`Daily`, `Weekly`, `⟳ 1:30 PM, Daily`,
  `Every 3 days`).
- Task without emoji: compact single-line row (~60 px) with title, subtitle
  and circle (`techfowler-2026-04/0050`, `properhonesttech-2026-04/0128`).
- Late chores show a red `4 days late` subtitle
  (`kerischoof-2025-12/0524-tasks-day-late-chores.jpg`,
  `stephanie-2026-05/0258-tasks-day-columns.jpg`).
- `Up for Grabs` column (house icon avatar, red `New` badge): chores any
  profile can claim (`properhonesttech-2026-04/0128`); first-run tip card
  `CHORES ANYONE CAN TACKLE ... Delete All / Keep`
  (`everymom-2026-10/0233-tasks-day-up-for-grabs.jpg`).
- Empty column: big emoji (raised hands, star, clapping hands, sparkles) +
  `Nothing to do today.` (`skylight-setup-2025-07/1902-tasks-new-chore.jpg`,
  `skylight-setup-2025-07/2102-tasks-empty-states-2025.jpg`,
  `livjowen-2026-04/0729-tasks-chores-empty-state.jpg`).
- One-time notices use the toast, e.g. `All routines now displayed by
  default. Close` (`everymom-2026-10/0204-tasks-day-routines-toast.jpg`).

### Week view: per-profile habit grid

![Tasks week view](assets/frames/stephanie-2026-05/0250-tasks-week-habit-grid.jpg)

- One profile at a time: avatar selector row at top-left (selected avatar
  ringed and saturated, others faded), section shortcut buttons top-right
  plus the star balance.
- Body: section header (`Morning`) and day headers `Sun 26 ... Sat 2` (today
  with a red badge). Each task is a full-width rounded row: emoji/thumbnail
  circle, title, then one white circle per day on which the task is due
  (blank where it is not scheduled). Narration calls it "a habit tracker"
  (`9vF1XR98nOw` 03:00).

### Task detail popover, add task, recurrence

![Task detail popover with Skip / Complete](assets/frames/properhonesttech-2026-04/0444-task-detail-popover-complete.jpg)
![After completing](assets/frames/properhonesttech-2026-04/0447-tasks-day-after-complete.jpg)
![Add Task sheet with Up for Grabs](assets/frames/everymom-2026-10/0049-add-task-sheet-up-for-grabs.jpg)
![Add Task form, generation A](assets/frames/skylight-setup-2025-07/1717-add-task-form.jpg)
![Emoji picker](assets/frames/skylight-setup-2025-07/1648-add-task-emoji-picker.jpg)
![Recurrence picker](assets/frames/nickbradley-2025-12/0241-add-task-recurrence-picker.jpg)
![Add Chore modal, generation A](assets/frames/skylight-chores-2025-04/0112-add-chore-dialog-2025.jpg)
![Task filter](assets/frames/livjowen-2026-04/0753-tasks-filter.jpg)

- Tap a task's body (not the circle): popover with serif title, pencil and
  trash, rows for date (`Tuesday, April 28`), section (`Morning`), repeat
  (`Daily`), `Assigned to` with avatar, and two actions `⟳ Skip` (text) and
  `Complete` (blue pill) (`properhonesttech-2026-04/0444`).
- Add Task (FAB on Tasks): right-side sheet like Add Event. Fields: `Title`,
  `Emoji (Optional)` dropdown that opens an emoji grid, `Profiles` avatar row
  (including `Up for Grabs`), `Chore | Routine` segmented control, `Date`
  toggle + date pill, `Time` toggle (`All Day`), `Repeats` toggle, inline hint
  `To assign star values, use the app.` with a close `x`, `Add` pill
  (`skylight-setup-2025-07/1717-add-task-form.jpg`,
  `everymom-2026-10/0049`). Star values are set only in the phone app.
- Recurrence: `Every [1] < >`, `Repeats every Day | Week`, weekday chips
  `Mo Tu We Th Fr Sa Su`, and for routines `In the Morning | Afternoon |
  Evening` (`nickbradley-2025-12/0241-add-task-recurrence-picker.jpg`).
- Tasks Filter popover: `Completed tasks` and `Late chores` toggles, then
  per-profile toggles with a pencil (`livjowen-2026-04/0753-tasks-filter.jpg`).
  With completed tasks hidden, checked items disappear from the column.

## Completion feedback and celebrations

```mermaid
stateDiagram-v2
    [*] --> Open
    Open --> Done: tap circle / Complete
    Done --> Open: Undo (toast)
    Open --> Skipped: Skip (popover)
    Done --> SectionDone: last open task in section
    SectionDone --> ProfileDone: last open task for profile today
    ProfileDone --> [*]
    note right of Done: card fills with profile tint, white check in solid circle, star particles fly toward the star pill, toast "X completed. Undo"
    note right of SectionDone: section button gets full ring + check, confetti burst
    note right of ProfileDone: grey scrim, serif "Yay! You completed all your tasks for the day.", emoji rain, column shows "All done!"
```

![Section progress ring](assets/frames/livjowen-2026-04/0833-task-section-progress.jpg)
![Section done check, completed card tint](assets/frames/nickbradley-2025-12/0017-tasks-closeup-section-done.jpg)
![Card fill and star particles](assets/frames/livjowen-2026-04/0836-task-tap-complete.jpg)
![Section complete confetti](assets/frames/livjowen-2026-04/0837-section-complete-confetti.jpg)
![All sections done](assets/frames/livjowen-2026-04/0848-profile-all-sections-done.jpg)
![All done overlay with emoji rain](assets/frames/livjowen-2026-04/0849-all-tasks-done-emoji-rain.jpg)
![All done column](assets/frames/livjowen-2026-04/1011-tasks-all-done-column.jpg)
![All done message and undo toast](assets/frames/kerischoof-2025-12/0600-all-done-message-undo-toast.jpg)
![Countdown day emoji rain](assets/frames/livjowen-2026-04/0305-countdown-emoji-rain.jpg)

- Task complete: the card background fills with a mid tint of the profile
  color (`#BFA6BF`-ish for purple, est.), the circle becomes a solid
  profile-color circle with a white check, small orange star particles burst
  from the card toward the column's star pill, the progress pill and section
  ring advance, and a toast `<Task> (<date>) completed. Undo` appears
  bottom-left (`livjowen-2026-04/0836`,
  `gregsgadgets-2026-06/0528-tasks-day-green-undo-toast.jpg`). Completed
  cards stay in place (or hide when the filter hides completed tasks).
- Profile finished for the day: full-screen grey scrim; centered white serif
  line `Yay! You completed all your tasks for the day.`; dozens of copies of
  one emoji (sunglasses face in the frame) rain from the top at varying sizes
  for a depth effect, lasting ~2-3 s; the column then shows a party-popper
  emoji and `All done!` (`livjowen-2026-04/0849`, `livjowen-2026-04/1011`).
  Official narration: "the screen explodes with emojis"
  (`yJ6LgSU1cuE` 01:50).
- Countdown reaching `Today`: the event's own emoji rains over the calendar
  (a cake emoji for a birthday) (`livjowen-2026-04/0305-countdown-emoji-rain.jpg`;
  narration `F-g4Qqk9yRk` 02:50-03:00).
- Reward redeemed and first star earned: see Rewards.

## Rewards

![Rewards columns, generation A](assets/frames/skylight-chores-2025-04/0036-rewards-columns-2025.jpg)
![Rewards with progress](assets/frames/stephanie-2026-05/0402-rewards-b.jpg)
![Rewards, three profiles](assets/frames/livjowen-2026-04/1004-rewards-three-profiles.jpg)
![Rewards: one affordable, others with progress bars](assets/frames/livjowen-2026-04/1340-rewards-consequence-redeem.jpg)
![Redeem pill in profile color](assets/frames/skylight-setup-2025-07/2422-rewards-redeem-green-pill.jpg)
![Redeemed dialog with star burst](assets/frames/skylight-setup-2025-07/2437-reward-redeemed-celebration.jpg)
![Redeemed dialog, portrait](assets/frames/skylight-chores-2025-04/0408-reward-redeemed-star-burst.jpg)
![First star dialog](assets/frames/everymom-2026-10/0345-first-star-earned-dialog.jpg)
![Disney-mode redeem (out of scope, for layout)](assets/frames/everymom-2026-10/0353-reward-redeemed-disney-celebration.jpg)
![Rewards empty state](assets/frames/livjowen-2026-04/0947-rewards-empty-state.jpg)
![Rewards tutorial](assets/frames/livjowen-2026-04/0042-rewards-intro-empty.jpg)
![Rewards app setup next to device](assets/frames/skylight-setup-2025-07/2417-rewards-columns-app-give-stars.jpg)

- Same column-per-profile layout as Tasks. Header: avatar, serif name, star
  balance `★ 250`.
- Reward card: large emoji (~64 px) centered, title in serif/sans below, then
  either a full-width `Redeem ★ 100` pill filled in the profile's color (when
  the balance covers the cost) or a progress bar `★ 55/80` / `44/500`
  (grey track, profile-color fill) when it does not. Lily's column in
  `livjowen-2026-04/1340-rewards-consequence-redeem.jpg` shows both states
  together: `Consequence` with a purple `Redeem ★ 5` pill and `$10` at
  `10/70`.
- `Hide redeemed` toggle in the top bar.
- Tap `Redeem`: centered white dialog (~420 px wide, 24 px radius) over a
  yellow radial glow with gold star particles bursting outward. Emoji at top,
  serif `Great work! Trip to the aquarium redeemed`, grey
  `By Willow for 50 stars on April 02, 2025`, blue `Done` pill, `Unredeem`
  text button. A reward set to renew reappears immediately after
  (`JtEwOeiP0nE` 24:30-24:40).
- First star ever: dialog `You Earned Your First Star! Redeem stars for
  rewards` with `Maybe Later` / `View Rewards` over the same glow
  (`everymom-2026-10/0345`).
- Rewards are created in the phone app only: empty state `Ready for a new
  goal? Create a reward in the app.` and a tutorial screen with a QR code
  (`livjowen-2026-04/0947`, `livjowen-2026-04/0042`).

## Lists

![Lists as tinted columns](assets/frames/stephanie-2026-05/0224-lists-columns.jpg)
![Grocery list with sections](assets/frames/livjowen-2026-04/1108-lists-grocery-sections.jpg)
![Lists view, generation C](assets/frames/everymom-2026-10/0054-lists-view.jpg)
![Adding an item with keyboard](assets/frames/everymom-2026-10/0236-lists-add-item-keyboard.jpg)
![Grocery and To-Do](assets/frames/techfowler-2026-04/0300-lists-grocery-todo.jpg)
![List headers with count badges](assets/frames/nickbradley-2025-12/0313-lists-closeup.jpg)
![Floating grocery panel, generation A](assets/frames/skylight-meals-2025-04/0258-grocery-list-floating-panel-2025.jpg)

- All visible lists side by side as tall rounded columns, each tinted with
  the list's own color (Aldi blue, Costco salmon, Kroger green in
  `stephanie-2026-05/0224`; Grocery List yellow-green, To-Do List neutral in
  `livjowen-2026-04/1108`). Horizontal scroll when lists exceed the width.
- Column header: optional emoji + serif list name, a circular count badge in
  the list color (`5`, `7`), a `...` menu.
- `Add item` input row at the top of each list; tapping it raises the
  keyboard and the row becomes an outlined text field with a clear `x`
  (`everymom-2026-10/0236`).
- Sections (grocery categories: Bakery, Dairy, Pantry, Canned goods) with
  emoji, count badge, collapse chevron `^` and a `+` to add into that section;
  `Add section` at the end.
- Items: text left, square checkbox right; checked items move to a completed
  group (narration `9vF1XR98nOw` 02:10-02:30; exact animation not captured).

## Meals

![Meals grid, populated](assets/frames/properhonesttech-2026-04/0656-meals-grid-week.jpg)
![Meals grid, colors](assets/frames/gregsgadgets-2026-06/0716-meals-grid-green.jpg)
![Meals grid](assets/frames/stephanie-2026-05/0416-meals-grid.jpg)
![Meals grid, full week, generation C](assets/frames/everymom-2026-10/0404-meals-grid-full.jpg)
![Meals grid close-up](assets/frames/nickbradley-2025-12/0021-meals-grid-closeup.jpg)
![Plan Meal for a snack](assets/frames/everymom-2026-10/0052-meals-plan-meal-snack.jpg)
![Tap a slot: red outline + Plan Meal panel](assets/frames/livjowen-2026-04/1029-plan-meal-slot-select.jpg)
![Plan Meal panel](assets/frames/livjowen-2026-04/1249-plan-meal-panel.jpg)
![Add to Grocery List? modal](assets/frames/livjowen-2026-04/1041-add-to-grocery-modal.jpg)
![Planned toast](assets/frames/livjowen-2026-04/1105-meals-grid-toast.jpg)
![Category filter popover](assets/frames/livjowen-2026-04/1051-meals-category-filter.jpg)
![Plan Meal panel, generation C](assets/frames/everymom-2026-10/0329-meals-plan-meal-panel.jpg)
![Meals filter](assets/frames/stephanie-2026-05/0440-meals-filter.jpg)
![Select Dinner panel, generation A](assets/frames/skylight-meals-2025-04/0018-meals-select-dinner-panel-2025.jpg)
![Recipe Box panel, generation A](assets/frames/skylight-setup-2025-07/2547-meals-recipe-box-2025.jpg)
![Add meal sheet, generation A](assets/frames/skylight-setup-2025-07/2602-add-meal-panel.jpg)
![Meal popover, generation A](assets/frames/skylight-setup-2025-07/2802-meal-recipe-popover.jpg)

- Grid: 7 day columns (header `Mon 27`, today with red badge) x one row per
  enabled meal category (Breakfast, Lunch, Dinner, Snack; labels rotated 90°
  in a narrow left gutter). Every cell is a rounded tile (~12 px radius,
  ~8 px gaps). Empty tiles are a light tint of the row's category color;
  planned tiles are a stronger tint with the meal name top-left (optionally
  with emoji). Category colors (configurable): Breakfast pale teal/mint,
  Lunch salmon, Dinner lavender/purple, Snack sand/yellow
  (`properhonesttech-2026-04/0656`, `livjowen-2026-04/1029`,
  `everymom-2026-10/0404-meals-grid-full.jpg`). Past days in the current
  week keep the empty tint; there is no dimming of past columns in the meals
  grid (`everymom-2026-10/0404`).
- Generation A put a permanent `Recipe Box` panel at the right of the grid
  (`skylight-setup-2025-07/2547-meals-recipe-box-2025.jpg`); generation B/C
  opens the panel only when a tile is tapped.
- Tap an empty tile: tile gets a red outline; a right-side panel `Plan Meal`
  (`everymom-2026-10/0052-meals-plan-meal-snack.jpg`) opens with
  `From Recipes | New Entry` tabs, category circles
  (`B L D S` letter circles in the category colors), and the recipe list
  (rows with `...`). Generation C's `New Entry` offers `Type / Website /
  Photo / Talk / Fridge` (`everymom-2026-10/0328-plan-meal-qr-new-entry.jpg`).
- Picking a recipe: centered modal `Add to Grocery List?` with a primary
  action and `No Thanks` (`livjowen-2026-04/1041`), then a toast
  `Lunch planned on Friday, March 27 and will be added to your Grocery List
  soon.` (`livjowen-2026-04/1105`).
- Top-right filter popover: rows per category with letter circle, toggle and
  pencil (rename/recolor) (`livjowen-2026-04/1051`).
- Meals also surface in Calendar views as outlined pills with category
  badges, controlled by Settings > Calendar > `Show in Calendar: Meals`
  (`kerischoof-2025-12/0340-settings-calendar.jpg`).

## Recipes

![Recipes list + detail](assets/frames/properhonesttech-2026-04/0704-recipes-detail-screensaver-toast.jpg)
![Recipe detail](assets/frames/livjowen-2026-04/1233-recipe-detail.jpg)
![Recipe detail, bagels](assets/frames/livjowen-2026-04/1131-recipes-detail-bagels.jpg)
![Recipe view](assets/frames/stephanie-2026-05/0452-recipe-view.jpg)
![Recipe detail, generation C](assets/frames/everymom-2026-10/0201-recipes-detail-eggs.jpg)

- Master-detail. Left ~35%: category filter circles (`Breakfast`, `Lunch`,
  `Dinner`, `Snack`; letter circles in category colors, selected ringed),
  then a scrolling list of recipe rows (category dot + name; selected row
  outlined).
- Right ~65%: serif recipe title (~36 px), pencil and red trash icons,
  chip buttons `Add to Grocery List` (cart icon) and `Plan Meal` (fork-and-knife icon), then `Category`,
  `Ingredients` (bulleted, sans) and `Instructions` (numbered) sections,
  scrolling.
- Entering Recipes pauses the screensaver (toast).

## Settings

![Settings > Calendar](assets/frames/kerischoof-2025-12/0340-settings-calendar.jpg)
![Settings > Calendar, schedule days slider](assets/frames/kerischoof-2025-12/0403-settings-calendar-days-slider.jpg)
![Week start segmented popover](assets/frames/properhonesttech-2026-04/0344-settings-calendar-week-start.jpg)
![Settings > General](assets/frames/everymom-2026-10/0131-settings-general.jpg)
![Settings > General, Display, Parental Lock, Volume](assets/frames/everymom-2026-10/0134-settings-display-parental-lock.jpg)

- Full-screen within the content area. Serif `Settings` title. Left column
  (~25%): section list with icons `General`, `Calendar`, `Photos`,
  `Reminders`, `Add ons` (generation C); selected row highlighted. Right:
  the section's form as grouped rows (icon, label, value or control).
- Calendar: `Calendar display name`; `Start week on` (Sunday/Monday, opens a
  two-option popover); `Show countdowns` (`Always`); toggles
  `Color code multi-profile events`, `Shade weekends`, `Dim past events`;
  `Show in Calendar: Meals` (Breakfast, Lunch, Dinner, Snack/Dessert
  multi-select); `Week view: Start on current day`; `Schedule view: Days
  displayed` slider (value 7 shown) and `Start on current day`.
- General: `Wi-Fi` (connected network + refresh), `Time Zone`, `Language`,
  location (`Plymouth, Minnesota`, used for weather), `Temperature`
  (Fahrenheit); `Display`: `Text size` (Medium), `Density` (Cozy),
  `Automatic brightness` toggle, `Brightness` 100%; `Parental Lock`:
  `Turn parental lock on after inactivity` toggle; `Volume`: `Video and
  reminder volume` 50%, `Keyboard clicks` toggle.
- Toggles are Material-style switches: blue track with white thumb when on,
  grey when off.

## Sleep, idle and screensaver clock

![Screensaver clock layout](assets/frames/everymom-2026-10/0334-screensaver-photo-clock.jpg)
![Screensaver clock layout, original Calendar](assets/frames/andruedwards-2025-12/0104-screensaver-photo-clock.jpg)

- `Sleep` is a rail item pinned at the bottom; tapping it puts the display to
  sleep (narration "you have the option that you can put your calendar to
  sleep", `9vF1XR98nOw` 05:30). No footage shows the sleep state itself or a
  sleep schedule setting.
- The idle screensaver (out of scope for photos) shows the layout a sleep/idle
  clock should follow: large white serif time `12:30 PM` and date
  `Wednesday, August 19` bottom-left with countdown chips under it
  (`everymom-2026-10/0334`, `andruedwards-2025-12/0104`).

## Setup and onboarding screens

![Wi-Fi with keyboard](assets/frames/skylight-setup-2025-07/0533-wifi-onscreen-keyboard.jpg)
![Activation code](assets/frames/skylight-setup-2025-07/0620-activation-code-screen.jpg)
![Time zone](assets/frames/skylight-setup-2025-07/0748-timezone-dialog.jpg)
![Edit Profile color grid](assets/frames/skylight-setup-2025-07/1533-edit-profile-color-keyboard.jpg)

- Onboarding uses an illustrated pastel landscape background with a
  right-side `Connect to Wi-Fi` panel (network list with lock icons), an
  activation-code card (QR + digit boxes + numeric keypad), and a `Set up
  your time zone` dialog.
- Edit Profile (from the filter pencil): right-side sheet with name field and
  a 5-column grid of color swatches.

Photos tab (out of scope, shown for the shared chrome): `111 Photos, 1 Video`
header with `Select`, `Albums`, `Use as screensaver`, and a square-tile grid
(`stephanie-2026-05/0516-photos.jpg`, `everymom-2026-10/0058-photos-grid.jpg`).

## Portrait orientation

![Portrait month, bottom nav](assets/frames/techfowler-2026-04/0155-portrait-month-bottom-nav.jpg)
![Portrait tasks, bottom nav](assets/frames/techfowler-2026-04/0215-portrait-tasks-bottom-nav.jpg)
![Portrait tasks, generation A](assets/frames/skylight-chores-2025-04/0244-portrait-tasks-2025.jpg)
![Portrait meals: days as rows](assets/frames/skylight-meals-2025-04/0106-portrait-meals-days-as-rows-2025.jpg)

- Wall-mounted portrait moves the nav rail to a bottom bar (icons + labels in
  one row); the top bar stays. Month grid gets taller rows; Tasks shows ~2.5
  columns with horizontal scroll; Meals transposes to days as rows. The table
  stand is landscape-only (narration `jgxOqL3md3A` 02:40).

## Design system summary

### Layout tokens (1920x1080, cozy density, estimates)

| Token | Value | Evidence |
|---|---|---|
| Nav rail width | ~96 px | `livjowen-2026-04/0836`, user photo |
| Top bar height | ~88-110 px | same |
| Profile/countdown strip | ~44-52 px pills, equal width, ~16 px gap | user photo, `properhonesttech-2026-04/0216` |
| Content padding | ~16-24 px | `livjowen-2026-04/0836` |
| Day header (time grid) | ~80 px | user photo |
| Hour height (schedule, 4 days) | ~64-68 px, pinch-adjustable | user photo, `skylight-setup-2025-07/1217` |
| Time gutter | ~90 px | user photo |
| Column card (tasks/rewards) | 1/3 to 1/4 of content width, ~24 px radius | `livjowen-2026-04/0836`, user photo |
| Task card | ~220 px (emoji) / ~60 px (compact) | `livjowen-2026-04/0836`, `techfowler-2026-04/0050` |
| Side sheet | ~30% width, full height, ~24 px left radius | `livjowen-2026-04/0225` |
| Popover | ~420-480 px wide, ~24 px radius, soft shadow | `properhonesttech-2026-04/0041`, `livjowen-2026-04/0302` |
| FAB | ~70-100 px circle, ~20 px from edges | `livjowen-2026-04/0836`, user photo |
| Event block radius | ~8 px; month pill fully rounded | render, `livjowen-2026-04/0301` |

Settings > Display > `Density` (Cozy shown) and `Text size` scale these; the
user's device appears to run a denser setting than the review units.

### Palette

| Role | Hex | Source |
|---|---|---|
| Nav rail background | `#E9F0F8` | render |
| Nav selected tile | `#FFFFFF` | render |
| Content background (render) | `#FFFFFF` | render |
| Content background (device, blue theme) | `#DCE8F3` top to `#D2E3E6` bottom | est., user photo, `properhonesttech-2026-04/0216` |
| Content background (device, green theme) | `#DDEFE4` to `#CFE6DA` | est., `gregsgadgets-2026-06/0100` |
| Surface (columns, cards) | white at ~60-80% opacity | all 2026 frames |
| Primary text | `#000000`-`#0A0A0A` | render |
| Secondary text (hour labels) | `#676767` | render |
| Nav label / icon | `#555555` / `#5C6165` | render |
| Today badge, current-time line | `#F06C53` (render); deeper red `#D9443F` on device (est.) | render, `livjowen-2026-04/0301` |
| Primary action (FAB, Save, Done, toggles) | `#1F6FB2` (est.) | `livjowen-2026-04/0836`, `properhonesttech-2026-04/0044` |
| Toast background | `#2B2F33` (est.) | `properhonesttech-2026-04/0512` |
| Event fills, render pastels | teal `#B3DAD9`, coral `#F1BCB6`, butter `#FFEACB`, lavender `#DDD1DE`, blush `#FFDBDB`, sage `#C6DCC9` | render |
| Event time text | darker shade of fill, e.g. `#466061` on teal | render |
| Progress strip | track = light tint (`#E1EFEF`), fill = mid tint (`#ACD6D7`) | render |
| All-day bar | `#D3ECD4` | render |
| Device event fills (more saturated) | muted teal `#7FB0AA`, lavender `#C7A9D4`, butter `#EED58A` (est.) | user photo, `properhonesttech-2026-04/0216` |
| Meal pill | white fill, warm tan border `#D9C3A5` (est.), category badge in category color | user photo, `everymom-2026-10/0046` |
| Star icon/particles | orange `#F2A33A` (est.) | `livjowen-2026-04/0836` |
| Reward glow | radial yellow `#FBE38A` to transparent (est.) | `skylight-setup-2025-07/2437` |

Profile color swatches offered when editing a profile (17, sampled from
`assets/appstore/ios-ipad-10-profile-edit.jpg`; the picker scrolls and also
includes purples and a custom/rainbow swatch seen in
`properhonesttech-2026-04/0304-app-add-profile.jpg`):

`#CB434C` `#FBA894` `#F66850` `#CE632D` `#F2B074` `#FEB306` `#FBD97F`
`#CE822E` `#FDC36D` `#408157` `#B5E085` `#2D7F86` `#82D7DC` `#2177AE`
`#00526C` `#93D1E5` `#A8D4D3`

Each profile color is used three ways: solid (avatar, Redeem pill, completed
check circle), mid tint (completed card fill, progress fill, event block on
device) and light tint (progress track, column wash).

### Typography

- Display serif (moderate contrast, book-like, similar to Source Serif 4 /
  Newsreader / Tiempos): top-bar date and time (~44 px / ~36 px), day and
  weekday headers, profile names, section headers (`Morning`), sheet and
  dialog titles (`Add Event`, `Settings`), popover titles, celebration text,
  screensaver clock. Regular weight, sentence case.
- UI sans (geometric-humanist, similar to Figtree / DM Sans / Outfit): event
  titles (semibold ~16-18 px), times and labels (regular ~14-15 px), nav
  labels (~15 px), chips, buttons, list items, task titles (semibold).
- Small caps / uppercase sans for card titles on Home (`CALENDAR`,
  `TODAY'S TASKS`, `LISTS`) and the time prefix in month chips (`3 PM`).
- No bold display text; hierarchy comes from the serif/sans pairing and
  size.

### Components

- **Pill button**: fully rounded, light fill or outline, sans label; primary
  pill solid blue with white text.
- **Segmented control**: two text options in a pill, selected one outlined
  (`Day | Week`, `Chore | Routine`, `From Recipes | New Entry`).
- **Avatar**: circle with white initial on the profile color, or photo, or
  illustrated animal avatar; selected state = ring.
- **Event block / chip / meal pill**: see Calendar.
- **Column card**: tall rounded translucent card per profile/list.
- **Side sheet**: right-anchored, scrim behind, back arrow + serif title,
  icon-led rows, bottom primary pill.
- **Popover**: anchored floating card, tap-outside dismiss.
- **Centered modal**: confirmations and celebrations (`Add to Grocery List?`,
  reward redeemed, first star, time picker).
- **Toast**: bottom-left dark snackbar with one action.
- **Toggle**: Material switch.
- **Empty state**: one large emoji or illustration + one short sentence.

## Interaction catalog

| Gesture / control | Result | Evidence |
|---|---|---|
| Tap rail item | Switch tab, rail tile highlights | all frames |
| Tap `View ▾` | Popover Schedule/Day/Week/Month | `properhonesttech-2026-04/0120`, `nickbradley-2025-12/0145` |
| `<` / `>` / `Today` | Previous/next period; back to today; header switches to period label when off today | `gregsgadgets-2026-06/0424`, `gregsgadgets-2026-06/0028` |
| Swipe horizontally | Move between periods | narration `N1yK3VicJGo` 04:10 ("use the touchscreen to swipe between the...") |
| Vertical scroll | Scroll time grid, columns, lists independently | narration `JtEwOeiP0nE` 13:10 |
| Pinch | Zoom schedule hour height | narration `JtEwOeiP0nE` 13:10-13:20, `skylight-setup-2025-07/1217` |
| Tap event | Anchored detail popover (edit pencil, delete trash) | `properhonesttech-2026-04/0041` |
| Tap FAB `+` | Add sheet for the current tab (Add Event on Calendar, Add Task on Tasks; other tabs not captured) | `livjowen-2026-04/0225`, `everymom-2026-10/0049` |
| Tap `+ Add Event` in a week cell | Add Event prefilled to that day | `properhonesttech-2026-04/0328` |
| Tap time field | Analog clock dialog, drag hand | `properhonesttech-2026-04/0048`, narration `JtEwOeiP0nE` 18:20 |
| Tap `Filter` | Profile/feature toggles popover | `nickbradley-2025-12/0020` |
| Tap task circle | Complete with fill, check, star particles, toast + Undo | `livjowen-2026-04/0836`, `gregsgadgets-2026-06/0528` |
| Tap task body | Task popover with Skip / Complete | `properhonesttech-2026-04/0444` |
| Tap section button | Jump/filter to that section | `kerischoof-2025-12/0648` |
| Long-press profile column | Reorder profiles | toast in `properhonesttech-2026-04/0512` |
| Tap `Redeem` | Redeemed dialog, star burst, Done/Unredeem | `skylight-setup-2025-07/2437` |
| Tap empty meal tile | Red outline + Plan Meal panel | `livjowen-2026-04/1029` |
| Tap `Add item` | Inline text field + keyboard | `everymom-2026-10/0236` |
| Tap list checkbox | Check item | `stephanie-2026-05/0224` |
| Tap section chevron | Collapse/expand list section | `everymom-2026-10/0054` |
| Inactivity | Screensaver (paused in Recipes); optional parental lock | `properhonesttech-2026-04/0704`, `everymom-2026-10/0134` |

Drag-and-drop of events or tasks was not seen in any footage.

### Animations

- Task complete: tint fill and check (~200 ms), star particles flying to the
  star pill (~600 ms), ring progress.
- Section complete: confetti burst around the section
  (`livjowen-2026-04/0837`).
- Day complete: scrim fade-in, centered message, emoji rain ~2-3 s.
- Countdown day: event emoji rain on the calendar.
- Reward redeem / first star: dialog scale-in with radial glow and star
  burst.
- Sheets slide in from the right; popovers fade/scale from their anchor
  (inferred from frame sequences, `jgxOqL3md3A` 00:40-00:45).
- Taps play a click sound (can be disabled; narration `vCFI8A6Axec` 06:20).

## Companion app

Listing data (iOS lookup API and Google Play page, fetched 2026-11-04):

| Field | iOS | Android |
|---|---|---|
| Name / seller | Skylight App, Glimpse LLC. | Skylight App, package `com.skylightframe.mobile` |
| Version / updated | 2.31.0, 2026-11-02 | updated 2026-10-29 |
| Rating | 4.80 from 52,570 ratings | 4.0, 27K reviews |
| Category | Photo & Video | Photography |
| Min OS | iOS 16.6 | n/a |
| First release | 2018-10-15 | n/a |

Description (identical on both stores): "Skylight is the operating system for
your family, bringing everyone's calendars, lists, routines, and memories
into one place. The Skylight App can be used to activate and manage your
Skylight Calendar and Skylight Frame." Calendar bullets: sync unlimited
calendars or create events directly; set recurring chores and routines; share
grocery and to-do lists; earn stars and unlock Rewards for completed tasks
[PLUS]; build your family recipe book and meal plans [PLUS]; upload photos
and videos as screensavers [PLUS]; auto-import events, PDFs, recipes [PLUS].

Version history on the App Store page goes back to 2.9.1 (2026-06-05): 25
releases in five months, roughly weekly, every note generic ("Bug fixes and
performance improvements", "This build contains bug fixes and improvements.",
"Bugs and fixes."). It reveals release cadence, not feature evolution; the
on-device generations above are the better record.

### Store screenshots

iOS iPhone (1284x2778) and iPad (2048x2732), Google Play phone and tablet
(1080x1920):

![iPhone hero](assets/appstore/ios-iphone-01-always-connected-hero.jpg)
![iPhone home grid](assets/appstore/ios-iphone-03-home-grid.jpg)
![iPhone schedule](assets/appstore/ios-iphone-04-schedule-week-list.jpg)
![iPhone grocery list](assets/appstore/ios-iphone-05-grocery-list.jpg)
![iPhone tasks](assets/appstore/ios-iphone-06-tasks-day.jpg)
![iPhone rewards](assets/appstore/ios-iphone-07-rewards.jpg)
![iPhone meals and recipes](assets/appstore/ios-iphone-08-meals-recipes.jpg)
![iPhone Sidekick](assets/appstore/ios-iphone-09-sidekick.jpg)
![iPhone profile edit](assets/appstore/ios-iphone-10-profile-edit.jpg)
![iPad tasks](assets/appstore/ios-ipad-06-tasks-day.jpg)
![Play tablet tasks](assets/appstore/play-14-tablet-tasks-day.jpg)

All files: `assets/appstore/ios-iphone-01..10-*.jpg`,
`assets/appstore/ios-ipad-01..10-*.jpg`, `assets/appstore/play-01..16-*.jpg`
(01-08 phone, 09-16 tablet), plus the cropped device render
`assets/appstore/ios-ipad-01-hero-device-render-crop.jpg`. Store captions:
"Share Photos That Show up in Seconds", "Keep Track of Every Detail, All in
One App", "Sync Everyone's Schedules Anytime, Anywhere", "Track To-Dos &
Groceries with Customizable Lists", "Help Your Family Get Things Done with
Intuitive Task Trackers", "Motivate Kids to Accomplish Goals with Rewards",
"Design Meal Plans & Create New Recipes from Scratch", "Magically Import
Details From Emails, PDFs, & Printouts with Sidekick", "Personalize Your
Profile with Photos or Avatars".

### App screens (store + footage)

![App home, light](assets/frames/techfowler-2026-04/0510-app-home-light.jpg)
![App in dark mode with device](assets/frames/kerischoof-2025-12/0320-week-view-and-app-home-dark.jpg)
![App schedule, dark](assets/frames/kerischoof-2025-12/0322-app-schedule-dark.jpg)
![App devices list, dark](assets/frames/kerischoof-2025-12/0418-app-devices-dark.jpg)
![App tasks day](assets/frames/properhonesttech-2026-04/0440-app-tasks-day.jpg)
![App add reward](assets/frames/properhonesttech-2026-04/0720-app-add-reward.jpg)
![App add profile](assets/frames/properhonesttech-2026-04/0304-app-add-profile.jpg)
![App plan meal form](assets/frames/techfowler-2026-04/0520-app-plan-meal-form.jpg)
![App plan meal](assets/frames/livjowen-2026-04/1125-app-plan-meal.jpg)
![App add task (chore)](assets/frames/livjowen-2026-04/0713-app-add-task-chore.jpg)
![App grocery toolbar](assets/frames/nickbradley-2025-12/0321-app-grocery-list-toolbar.jpg)
![App Sidekick menu (out of scope)](assets/frames/properhonesttech-2026-04/0648-app-sidekick-recipe.jpg)
![App edit profile next to month view](assets/frames/everymom-2026-10/0225-month-countdown-strip-app-edit-profile.jpg)

- Same visual language as the device: serif titles (`Miller Family`,
  `Rewards`, `Theresa`), sans body, pastel profile tints, blue FAB, light
  surfaces on an off-white background; dark mode supported
  (`kerischoof-2025-12/0320`, `0322`, `0418`).
- Home: back arrow + household name + account-switch icon; 3x3 grid of
  pastel circular icons `Calendar, Tasks, Rewards / Lists, Meals, Recipes /
  Photos, Profiles, Sidekick`; below it a today agenda card (`Thurs, Nov 13`
  with tinted event rows) (`ios-iphone-03-home-grid.jpg`,
  `techfowler-2026-04/0510`).
- Calendar: agenda list for a week (`Nov 16 - Nov 22`) with an icon toolbar
  `Previous, Today, Next, Week, Filter, Search`; date column at left, event
  rows tinted per profile with avatar; meals as outlined pills with a
  category badge (`ios-iphone-04-schedule-week-list.jpg`).
- Tasks: date title, toolbar `Previous, Today, Next, Filter, Task Box`,
  avatar row to pick a profile, then one profile card with section buttons
  and task cards (`ios-iphone-06-tasks-day.jpg`,
  `properhonesttech-2026-04/0440`). Star values and rewards are managed here
  (`Add Reward`: description, emoji, `Renew after redeeming`, star count,
  profiles; `properhonesttech-2026-04/0720`).
- Lists: toolbar `Select, Edit list, Completed, Organize, Order` (Order =
  Instacart), sections with `... N items ^` (`ios-iphone-05-grocery-list.jpg`).
- Meals/Recipes: month-grouped meal plan by day and category; recipe list
  with category circles and search (`ios-iphone-08-meals-recipes.jpg`).
- Profile edit: avatar carousel (photo or illustrated animals), the 17-swatch
  color row, name, `Birthday`, `Linked Calendars` (`ios-iphone-10-profile-edit.jpg`).
- Android tablet layouts (`play-09` to `play-16`) show two profile columns
  side by side in Tasks and Rewards, closest to the device layout.

## Differences between the user's photos and Calendar 2 footage

The user's photos (`assets/user-device/`, Nov 4 2026) match generation C
(nav begins `S Home`, Recipes present, profile progress strip, Day|Week on
Tasks). Differences from the Calendar 2 review units:

| Aspect | User's device | Calendar 2 footage |
|---|---|---|
| Profile colors | All profiles the same dark green avatar and muted teal events | Distinct color per profile (purple/green/blue in `livjowen-2026-04`, teal/purple/yellow in `properhonesttech-2026-04`) |
| Density | Denser: ~64 px/hour, ~70 px FAB, 4 task columns | Cozy: ~100 px FAB, 3 task columns (`livjowen-2026-04/0836`) |
| Meal pills in calendar | Outlined `Chips`/`Fruit` pills; category badge not visible at photo resolution | Outlined pills with a colored category badge (`everymom-2026-10/0046`) |
| Background | Pale blue wash | Pale blue (most), green (`gregsgadgets-2026-06`) |
| Top bar | No circled `!` icon | `!` icon after the temperature on some units (`livjowen-2026-04`, `gregsgadgets-2026-06`) |
| Star balances | `28.5K` (abbreviated) | Two-digit balances |

Nothing in the footage contradicts the photos; the photos are a valid
reference for the current software. The hardware difference (original vs
Calendar 2) does not change the UI: original-Calendar units in late 2025
(`nickbradley-2025-12`, `kerischoof-2025-12`) run the same software line.

## Open questions and gaps

Screens with no usable footage:

- Sleep state itself (black screen? dim clock?) and any sleep schedule
  setting; only the rail button and narration exist.
- Event `Repeats` expanded options and the date picker on the device (only
  the task recurrence picker and the time dialog were captured).
- Home `Customize` screen.
- Settings sections `Photos`, `Reminders`, `Add ons`; device-level profile
  management beyond Edit Profile (name + color).
- List management on the device: create, rename, recolor, delete a list;
  editing or deleting an item; the completed-items group.
- Recipe create/edit form on the device (only detail view).
- Routine-specific behaviors beyond sections (timers, sequential steps).
- Transition animations between periods (swipe) and between tabs; whether
  views animate at all.
- Weather tap target (does tapping the header weather open a forecast?).

Uncertain details:

- Meaning of the circled `!` next to the temperature (sync/action-required
  indicator is the likely reading; the help-center research has an
  "action required" banner in `assets/help-calendar/`).
- Whether the background tint (blue vs green) is a user-selectable theme or
  derived from something else (no setting seen).
- Tasks Day view with more profiles than fit: horizontal scroll vs shrinking
  columns.
- Exact star-particle and emoji-rain timings (estimated from 0.25-0.5 s frame
  sampling).
- Whether completed tasks reorder within a section (cards appear to keep
  position in `livjowen-2026-04/0836`).
