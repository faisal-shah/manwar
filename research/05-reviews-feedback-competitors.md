# 05 - Reviews, user feedback, competitors

Research slice for the Skylight Calendar 2 + Plus clone (web app, full screen on
the family's own wall/counter tablet). Covers independent reviews, real-user
feedback, pain points, feature requests, competitors/DIY alternatives, and
tablet/kiosk concerns. Out of scope here (and in the build): Disney Mode, Magic
Import, Photo Screensaver; they appear below only where a review's point
transfers to an in-scope feature.

Compiled 2026-11-04.

## Conventions and access limits

- Every factual claim carries a source key in brackets, e.g. `[WIRED]`; keys
  resolve in [Sources](#sources). Text marked **(inference)** is my own
  reasoning, not a source claim. "Observed in photo" means I read it off a
  review photo saved under `assets/reviews/`.
- These sites block our crawler and were not worked around: nytimes.com
  (Wirecutter), cnet.com, pcmag.com, goodhousekeeping.com, usatoday.com,
  reddit.com, mashable.com, zdnet.com, theguardian.com. Forbes and Consumer
  Reports returned 403/paywall. For those, only search-result snippets or
  secondary summaries were available and are labelled as such. The Verge and
  Wired full texts were read once early on; nothing further was fetched from
  blocked domains.
- Wirecutter: Skylight's site and Amazon listing claim "Featured on Wirecutter
  2026" `[AMZ]` `[SKY]`. The Wirecutter guide itself could not be read, so its
  pick, ranking, and reasoning are **unverified**.
- r/skylightcalendar exists (Skylight's own roadmap links to it `[RM]`), but
  Reddit could not be read. Reddit evidence below comes from a third-party
  digest that paraphrases eight threads `[SFL]`; thread URLs are listed in
  Sources for a human to open.
- No full Calendar review was found from Tom's Guide, TechRadar, or Engadget
  (only deal posts and launch news) `[TG]` `[TR]`.

## 1. Review digest

Calendar 2 reviews first, then comparisons, Max, and Cal 1; roughly newest first. "Cal 1" = original 15-inch Skylight
Calendar; "Cal 2" = 2026 15-inch Calendar 2; "Max" = 27-inch Calendar Max.

| Source | Date | Model | Verdict | Key points | Key |
|---|---|---|---|---|---|
| Tech Between the Lines (J. Scharlemann) | 2026-07-14, upd 2026-10-21 | Cal 2 | Keeps it; "can't quite get out of its own way" | Most detailed long-term review. 2.4 GHz-only Wi-Fi; no offline. Google 2-way, Apple needs app-specific password, Outlook 1-way. Event showed at wrong time twice. Tasks-in-week-view crowds events. Rewards are bare text labels, stars managed only in app. Home view "closer to a proof of concept". Messages, Device Navigation, Track Habits, Up for Grabs described in detail. App "utilitarian". | `[TBTL]` |
| Reviewed (L. Harrington) | 2026-07-08 | Cal 2 | Yes, "earns its place" | Day/week/month/schedule; schedule = 12-to-12 timeline; month view "cramped and hard to read". Filter by family / person / single Google calendar. Header shows time + outside temp. Google sync fast and "genuinely two-way". Meals: pick which meal types show on calendar. Grocery list does not sync with AnyList. Preloaded recipes "basic". | `[REV26]` |
| Android Police (S. Radochia) | 2026-04-09 | Cal 2 | Positive | Menus quick; sync "feels instant". To-do entry in phone app takes seconds and appears on device next glance. "a product that doesn't try to do too much." Price high; extras behind Plus. | `[AP26]` |
| Wired (N. Farrell) | 2026-03-17 | Cal 2 | 7/10 | Tabs: Lists, Tasks, Rewards, Meals, Recipes, Photos, Sleep, Settings. Shared event shown once with both calendars' colors. Quick meal text not remembered. Re-prompts "add ingredients to list?" every recipe. No task alerts seen. "The font isn't so large that you can read it across a room." 15-inch "just big enough to see four days at a time." Paywall is biggest complaint. | `[WIRED]` |
| SlashGear (A. Doud) | 2026-02-19 | Cal 2 | Recommended | Faster, brighter, more responsive than Cal 1. Stand landscape-only ("a step back"). Event alert pop-up's OK button hard to reach; wants auto-dismiss timer. Meal ingredients go to Skylight list, not AnyList. Plus "grates a little". | `[SG26]` |
| getsense.ai | 2026-10-12 | Cal 2 | 3.5/5 | Written by a competitor; spec-sheet, not hands-on. Same software as Cal 1; hardware-only upgrade. Fingerprints at kid height. 5-year cost $695. | `[GS]` |
| Forbes Vetted | 2026 | Cal 2 | Best overall, 4.0 | Snippets only (403). Tested against Cozyla Calendar+ 2; Hearth = "best for families". | `[FORBES]` |
| Consumer Reports (A. Lashbrook) | upd 2026-08-14 | Max vs Hearth, Cozyla+ 2, Echo Show 21 | Skylight top-rated core calendar | Paywalled; via snippets/secondary. Skylight's calendar features rated best of four (daily, weekly, monthly, four-day schedule). Hearth wall-only vertical; Skylight, Cozyla, Echo can mount either way. | `[CR]` `[QZ]` |
| Motherhood Together (Substack) | 2026-09-09 | Max (after returning 15") | Loves it | 15" landscape month view shows "a max of 3 events a day". Setup 2-3 hours; duplicates. Only one Google calendar read/write. Routines only morning/afternoon/evening, "cannot make them skip days". Enters all kid chores from phone, never on device. | `[MT]` |
| Chris Loves Julia | 2026-07-22 | Skylight (size n/a) | Recommends | Routines reset daily; chores roll over with red "one day late". Up-for-grabs works. Star economy tips (tiered cash-out). Kids batch-check routines; reading tasks hard to verify. Not "set-it-and-forget-it". | `[CLJ]` |
| Taste of Home (M. Hillman) | 2026-06-07 | 15" with Plus, 9 months (Cal 1, inference from purchase date) | "very enthusiastic YES!" | App faster than touchscreen for entry. Tasks split morning/afternoon/evening; multi-assignee; repeat daily/weekly/monthly. Missing a daily task = no star that day. Checked grocery items auto-removed. No glitches. No battery. | `[TOH]` |
| Taste of Home: Skylight vs Hearth | 2026-07-30 | Cal 1 vs Hearth | Skylight better value | Hearth: views day/week/month/agenda; photo avatars replace "default dinosaur avatars"; iCal is view-only (linked via Google); $700 + required $86/yr membership. | `[TOHvH]` |
| Bless'er House | 2025-07-31, upd 2026-09-30 | Max | Would buy again | Only Google full 2-way; others "a little clunky". No Wi-Fi = no calendar. Phone typing painful until web app shipped. PIN parental controls. | `[BH]` |
| The Verge (J. P. Tuohy) | 2025-02-20 (upd 02-21) | Max (also tested 15") | 7/10 | Bad: two-way only Google; no integration with other list apps; meal planning needs work; no dark mode; too bright at night despite auto-brightness. 15" "wasn't large enough to display four people's schedules at a glance" and hard to see at angles. Recipes alphabetical only; shopping-list export dumps all ingredients ("four separate instances of '2 tablespoons of olive oil'"). No apps/web/voice: a selling point. Plus price doubled $39 -> $79. | `[VERGE]` |
| SlashGear (E. Street) | 2025-03-10 | Cal 1 | Worth it for multi-adult homes | Add event via + or long-press on day/time; Event-vs-Dinner prompt every time. Profiles must exist before events; profile creation app-only. Each synced account created a new profile, no obvious merge. "no option to change things like the colors, fonts, or layout." | `[SG25]` |
| Kelly Nolan (productivity coach + reader comments) | 2025-06-06 | Skylight, Hearth, DAKboard | "go with a Skylight" | Hearth "clunky and slow-ish". Chore/routine novelty fades. Pre-readers need emoji labels. Still needs one person to manage it. | `[KN]` |
| Digital Trends (J. Bitner) | 2024-07-12 | Max | Recommended | No touch lag. Can't easily remove members (factory reset). Events can't be marked complete. Meals not on calendar (since fixed by setting `[RM]`). | `[DT24]` |
| Android Police (M. Bizzaco) | 2024-07-06 | Cal 1 | 6/10 | Purple + button bottom-right adds events; color-coded tiles. "Very expensive for a non-smart display." | `[AP24]` |
| Reviewed (A. Lane) | upd 2023-08-30 | Cal 1 | Must-have; Editors' Choice | Week view most useful; each calendar gets a color family members choose. No battery. | `[REV23]` |
| T3 | n/a | Cal 1 | 4/5 | Snippet only: slight screen lag, fingerprints show easily. | `[T3]` |
| The Quality Edit | 2026-03-31 | Hearth vs Skylight | Hearth | **Sponsored by Hearth.** "Skylight made our schedule easier to see, but Hearth ... easier to run." Kids self-run Hearth routines with icons. | `[QE]` |

Store and community aggregates:

- Apple App Store, Skylight app: 4.8 from about 53K ratings `[AS]`. I pulled
  the 500 most recent reviews via Apple's public RSS feed (2026-06-04 to
  2026-11-02): 338 five-star, 54 four, 29 three, 22 two, 57 one `[AS-RSS]`.
  The app serves both Frame and Calendar owners; 9 of the 108 reviews rated
  3 stars or lower are Frame-only.
- Trustpilot (Skylight Frame, whole company): 4.1/5, 1,291 reviews; recent
  complaints are mostly delivery delays and subscription; praise for support
  and chores/rewards `[TP]`.
- Best Buy Cal 2: 4.5/5 from 206 reviews, 89% recommend (snippet) `[BBY]`.

## 2. Behavior details learned from reviews (by feature)

What a clone needs to reproduce, as reviewers and users experienced it.
Help-center mechanics are covered by another researcher; this section records
what independent sources saw.

### 2.1 Screen chrome and navigation

- Left vertical tab rail, top to bottom: Home, Calendar, Lists, Tasks,
  Rewards, Meals, Recipes, Photos, Sleep, Settings (Settings pinned at bottom)
  `[WIRED]` `[TBTL]`; observed in photos `rev-tbtl-home-view.jpg`,
  `rev-tbtl-device-navigation.jpg`.
- Header row: date ("Wed, Jul 15"), time ("10:10 AM"), weather icon +
  current temperature `[REV26]`; observed in photos. On the Home view the
  header shows the household name ("Family") instead of the date.
- Right side of header (Calendar): Sidekick button, view selector (labelled
  with the current view, e.g. "Schedule"), Filter, `<`, Today, `>` (observed in
  `rev-tbtl-messages-popup.jpg`). Tasks tab instead shows a Day | Week
  segmented toggle (observed in `rev-tbtl-tasks-day-upforgrabs.jpg`).
- Profile chip row under the header on Calendar: avatar + name + a done/total
  task counter, e.g. "Alex 1/5" (observed in `rev-tbtl-messages-popup.jpg`).
- Floating round "+" button, bottom-right, on every content tab `[AP24]`;
  observed in all photos.
- Typography: serif display face for dates/names, sans-serif for body
  (observed in photos).
- Device Navigation setting (Oct 2026, free) toggles each rail tab on or off,
  per device or from the app. Not a lock: anyone at the screen can re-enable
  tabs `[TBTL]`.
- "What's New" pop-ups had to be acknowledged before use, near daily: "There is
  no way to opt out of them" `[AS-RSS 2026-09-28]`. Skylight then shipped a
  setting: Immediately / Weekly (Monday evening) / Never `[TBTL]` `[RM]`.

### 2.2 Calendar

- Views: day, week, month, schedule `[REV26]` `[TOH]`. Schedule view is an
  hour-by-hour timeline (Reviewed: "12-to-12"), and in the app can show
  multiple days `[REV26]` `[RM]`. Consumer Reports credits a four-day schedule
  view `[CR]`.
- Week layout on the 15-inch screen: Wired could see "four days at a time"
  `[WIRED]`. The Home view's calendar card shows two rows, today plus 3 days,
  then the next 3 days plus a "Next Week" tile with its date range (observed
  in `rev-tbtl-home-view.jpg`). Each day header shows weather icon and "N
  events" or "No events".
- Event tile: rounded card filled with the profile color, title (ellipsized),
  time range ("12 - 7 AM", "9:15 - 10:30 PM"), profile avatar badge
  bottom-right. Multi-profile events render as diagonal stripes of each
  profile's color (setting, default on) `[RM]`; Wired saw a shared event shown
  once with both colors `[WIRED]` `[CLJ]`.
- Month view: weak spot. "cramped and hard to read" on a busy calendar
  `[REV26]`; max 3 events/day on the 15-inch in landscape `[MT]`. Later
  additions: option to start month view at the current week, swipe to change
  months, 10-day weather icons `[RM]` `[TBTL]`. App month view lists events out
  of chronological order `[AS-RSS 2026-07-06]`.
- Other display settings: shade weekends, dim past days, start week
  Sunday/Monday, smaller font / density setting, Small/Medium/Large text
  `[RM]` `[HELP-FONT]`. No 24-hour time `[HELP-24H]`; one buyer nearly returned
  it for Hearth over this `[AS-RSS 2026-10-28]`.
- Event creation on device: tap "+" or long-press a day/time; dialog with
  name (emoji allowed; emoji search added), start/end, recurrence; tap an
  event to edit or delete `[SG25]` `[TBTL]`. An Event-vs-Dinner type prompt
  appeared each time `[SG25]`. A "+ Add event" link also sits inside day
  columns (observed in `rev-tbtl-messages-popup.jpg`).
- Users find the phone app faster than the touchscreen for entering events
  `[TOH]` `[MT]`, and the June 2026 app update (2.12.0) that removed
  tap-a-day-to-add and week-to-week paging drew 1-star reviews
  `[AS-RSS 2026-06-29, 2026-06-25]`.
- Event alerts pop up on the device with an OK button; reviewer wants a
  timeout auto-dismiss `[SG26]`. Event reminders cap at two per event
  `[AS-RSS 2026-09-08]`.
- Countdowns for events exist `[RM]`; events cannot be marked complete
  `[DT24]`.
- Filter: show whole family, one person, or one source calendar `[REV26]`.

### 2.3 Calendar sync

- Google: two-way, fast `[REV26]` `[AP26]` `[CLJ]`. Only one Google calendar
  is read/write for at least one user `[MT]` (inference: the "write-back"
  calendar is chosen per profile or account).
- Apple iCloud: two-way is now live `[RM]` but needs an app-specific password
  `[TBTL]`, and Skylight's own doc allows up to 15 minutes for incoming
  updates `[SFL]`. Users still report double entries and edit/delete failures
  with iCloud `[AS-RSS 2026-09-17, 2026-07-05, 2026-07-14]`.
- Outlook: one-way import; corporate/Exchange accounts may be blocked by IT,
  "a coin flip" `[TBTL]` `[VERGE]`. Also Yahoo, Cozi, TeamSnap, any public ICS
  link `[VERGE]`; not QGenda `[AS-RSS 2026-09-05]`.
- Before Apple two-way: events added on the device to a non-Google calendar
  stayed only on Skylight `[VERGE]`.
- Each synced calendar becomes a profile/label; users found this confusing
  and had to merge or relabel (`every_synced_calendar_has_its_own_profile_now`
  thread) `[SG25]` `[MT]` `[SFL]`. Skylight is building "Better Profile
  Management" to link a new calendar to an existing profile `[RM]`.
- Reliability: wrong event time shown twice (8:45 a.m. as 2:45 p.m.), fixed
  itself `[TBTL]`; "a wrong-time calendar is worse than no calendar"
  (paraphrase) `[TBTL]`. Lists differing between device and phones; events
  that would not delete (Reddit, June 2026) `[SFL]`.
- No offline mode on device or app; app has "no local storing of data for
  offline viewing" `[AS]` `[TBTL]` `[BH]`.

### 2.4 Profiles

- Color per profile; avatar or photo per profile `[RM]` `[TOHvH]`. Unlimited
  profiles `[TOH]`. Profiles vs labels (category, e.g. "Soccer") are
  convertible `[RM]`.
- Removing a member used to require a factory reset `[DT24]`; "Delete
  profiles & labels" is now live `[RM]`.
- Roles: every app user is effectively an admin. "Kids can add random
  rewards/stars" `[AS-RSS 2026-07-02]`; yet kids under 16 cannot get app
  access at all `[AS-RSS 2026-08-28]`. Device has a 4-digit parental lock for
  adding/editing events and chores `[RM]` `[BH]` `[TOH]`, but no per-kid lock:
  "wish there was a screen lock so the littles wouldn't be able to mark off
  their siblings' chores" `[AS-RSS 2026-06-25]`.

### 2.5 Tasks: chores and routines

- Two kinds: routines (morning/afternoon/evening, reset daily) and chores
  (due date, roll over, show "N days late" in red) `[CLJ]` `[TOH]`; observed
  in `rev-tbtl-tasks-day-upforgrabs.jpg` ("Dishes / 5 days late").
- Day view: one column per profile plus an "Up for Grabs" column. Column
  header: avatar, name, "check 0/3" progress pill, star total. Routine
  sections toggled by Morning/Evening icon chips. Task card: large emoji
  illustration, label, star value chip, streak chip, round check target at
  the right. Empty state: illustration + "Nothing to do today." (observed in
  photo).
- Week view: grid, rows = tasks (emoji icon, name, time), columns = days,
  check circles fill teal when done; today's column flagged with a red date
  badge; profile avatars above as filter; progress ring + star count top
  right (observed in `rev-reviewed-tasks-week.jpg`).
- Up for Grabs: unassigned chores anyone can claim for stars; shown on Home;
  can be skipped and reordered `[TBTL]` `[TOH]` `[CLJ]`. The iOS widget does
  not show them `[AS-RSS 2026-09-21]`.
- Repeat daily/weekly/monthly; multi-assignee at creation `[TOH]`; repeat
  after completion `[RM]`; skip a day (vacation) `[RM]`. Routines could not
  skip days or run weekly `[MT]`. Assignees cannot be added after creation,
  no copy/duplicate `[AS-RSS 2026-08-26]`.
- Late chores show on the day completed, not the day due `[RM]`.
- Task Due Reminders (free): phone push plus on-device pop-up `[TBTL]`. Wired
  saw no alert for a timed task and found it two days late only after opening
  Tasks `[WIRED]` (inference: reminders shipped after or were off during
  Wired's test).
- Tasks can be shown in the calendar week view; reviewers turned it off
  because it pushes events off screen `[REV26]` `[TBTL]`.
- Track Habits: streaks that survive a skipped day `[TBTL]`. Task
  descriptions for step-by-step instructions `[TBTL]`.
- Recurrence bugs: chores becoming inaccurate, duplicating, deleting
  themselves `[AS-RSS 2026-06-06, 2026-07-31, 2026-09-04]`.
- Kid behavior: kids batch-check routines; reading tasks are unverifiable
  `[CLJ]`; novelty fades `[KN]`; pre-readers need pictures `[KN]` `[AS-RSS
  2026-06-06]`.

### 2.6 Rewards (Plus)

- Stars per task (custom values; harder tasks more) `[TOH]` `[CLJ]`.
  Rewards are text labels with a star threshold; no images or notes `[TBTL]`.
- Stars/rewards were creatable only in the app `[TBTL]` `[SFL]` `[AS-RSS
  2026-06-04]`; "Add Stars on your device" is now live `[RM]`. Removing stars
  from a kid's total is app-only `[TBTL]`.
- Missing a daily routine item = no star that day `[TOH]`. Parents layer
  their own economy (25 cents per star, tiered cash-out) `[CLJ]`; allowance
  gated on "all stars for the week" `[BH]`.
- Reviewer verdict: feels "launched before it was done" `[TBTL]`.

### 2.7 Lists

- Free. Multiple lists (grocery, to-do, wish lists per child) `[AP26]`
  `[CLJ]`. Device redesign shows several lists at once; sections,
  drag-and-drop reorder, three-dot menu `[TBTL]` `[RM]`.
- Checked items disappear automatically `[TOH]`. Lacks notes and quantity
  fields `[TBTL]`. Repeating staples are "lost forever once completed";
  request for a master list to pick from `[AS-RSS 2026-10-07]`.
- No sync to AnyList or other list apps `[REV26]` `[SG26]` `[VERGE]`. Exports:
  Instacart, Walmart+ (in progress), Alexa skill for adding items, AI
  "Organize" by aisle (Plus) `[RM]`.
- Bugs: "clear completed" reverting within seconds, re-added items, stale
  list versions `[AS-RSS 2026-07-24, 2026-07-05, 2026-07-02]`.

### 2.8 Meals and recipes (Plus)

- Meals tab: week grid, rows Breakfast / Lunch / Dinner / Snack with a
  pastel color per meal type; filled cells darker (observed in
  `rev-reviewed-meals-week.jpg`). Choose which meal types appear on the
  calendar (reviewer shows dinner only) `[REV26]`; a "Dinner" chip then
  appears on calendar days (observed in `rev-tbtl-messages-popup.jpg`).
- Free-text meal ("Giant Meatball", "Dinner at Grandma's!") without saving a
  recipe `[WIRED]` `[RM]`; not remembered for reuse unless saved or set
  recurring `[WIRED]`.
- Adding a recipe to a meal prompts to add its ingredients to the grocery
  list every time `[WIRED]`; it adds all of them, no picking, no merging of
  duplicates `[VERGE]`. Post-update flow leaves the user in Groceries instead
  of returning to Meals `[AS-RSS 2026-09-20, 2026-10-18]`.
- Recipe box: master-detail. Left list with B/L/D/S category chips; right
  pane with title, edit/delete, "Add to Grocery List", "Plan Meal", category,
  description, ingredients, equipment, instructions as text (observed in
  `rev-reviewed-recipe-detail.jpg`). Categories fixed to the four meal types,
  alphabetical sort `[VERGE]`; users want custom categories (dessert,
  canning) `[AS-RSS 2026-07-07, 2026-09-06]`. Recipe box takes "several taps"
  to reach `[VERGE]`.
- Meal plans tagged to a profile are in progress `[RM]`.

### 2.9 Weather, sleep, brightness

- Current temp in header; 10-day icons in week and month `[REV26]` `[RM]`.
- Sleep: scheduled off-hours (reviewer: 10 p.m.-6 a.m.) plus manual toggle
  `[REV26]`. "a bit too bright at night"; "a dark mode would be very welcome"
  `[VERGE]`. No dark mode as of late 2025 `[THREADS]`.
- Requests: separate weekday/weekend sleep times (Reddit, Feb 2026) because an
  early wake lit a nearby bedroom `[SFL]`. Plus users got separate
  weekday/weekend screensaver schedules `[TBTL]`.

### 2.10 Messages (Plus, Oct 2026)

- Type or record a note in the app, send now or schedule (repeatable).
  Device shows a full-screen sticky-note takeover with To/From avatars, "Ok!"
  and a play button to read aloud; stays until someone taps Ok! `[TBTL]`
  `[RM]`; observed in `rev-tbtl-messages-popup.jpg`. Reviewer: "the most
  useful" recent Plus feature `[TBTL]`. Users had asked for a virtual post-it
  `[AS-RSS 2026-10-11]`.

### 2.11 Companion app and multi-device

- App is required for setup, profiles, and (until recently) stars `[SG25]`
  `[TBTL]`. Reviewer: it "still just kind of exists" `[TBTL]`. Web version at
  ourskylight.com now exists `[RM]` `[BH]`.
- June 2026 app 2.12 broke forward navigation (could not view past the
  current month or December 2026, no week-to-week paging): 15 reviews in
  the sample, 14 of them between 2026-06-24 and 2026-07-02 `[AS-RSS]`. Reviewers blame QA: "updates appear to lack proper quality
  assurance" `[AS]`.
- Multi-device linking (several displays share one household) `[RM]`; one
  Plus plan covers all devices in a home `[GS]`, but Frame + Calendar owners
  report paying twice `[AS-RSS 2026-10-05]`.
- Notifications users want: "notify when someone adds an event" (3+
  reviews) `[AS-RSS 2026-10-19, 2026-10-05, 2026-09-14]`; now in progress
  `[RM]`. Task-completed push exists `[RM]`.

## 3. Top complaints, ranked

Ranking blends (a) how many independent reviews raise it and (b) the App
Store sample: 108 reviews rated 3 stars or less from the 500 most recent
(Jun-Nov 2026), keyword-coded, overlapping, approximate `[AS-RSS]`.

| # | Complaint | Reviews raising it | App Store low-star count (approx.) | Representative evidence |
|---|---|---|---|---|
| 1 | Subscription paywall on features buyers think they bought; price doubled $39 -> $79; ads/upsell inside a paid device | WIRED, VERGE, SG25, SG26, AP24, AP26, TBTL, CLJ, BH, MT, GS, SD, TP | ~36 (plus ~30 photo-frame paywall) | "270 dollar product should not feel like a 'freemium' app" `[AS-RSS 2026-08-16]`; "HIDE OPTIONAL PAID FEATURES" `[AS-RSS 2026-07-02]`; "A subscription for a calendar? Pass" `[SD]` |
| 2 | Software quality: regressions after updates, crashes, glitchy app | TBTL ("thin implementation, slow rollout"), AS | ~50 (incl. 15 on the June forward-navigation break) | "Skylight constantly is adding features that break other features" `[AS-RSS 2026-07-01]` |
| 3 | Two-way sync limited / unreliable outside Google; confusing profile-per-calendar; duplicates | VERGE, BH, MT, TBTL, GS, SG25, SFL | ~17 sync + ~7 Apple/Outlook | "iCloud calendars not linking correctly and making double entries" `[AS-RSS 2026-09-17]` |
| 4 | Must use the phone for core actions; app UX clunky, too many taps | SFL (Reddit), TBTL, MT, TOH, SG25 | ~28 | "Why would I need to use my phone to use all functionalities of the Calendar display" `[AS-RSS 2026-06-04]` |
| 5 | Readability: month view cramped; text not readable across the room; 15" too small for 4+ people | WIRED, VERGE, REV26, MT | 0 (device-only issue, not app) | "You'll need to be right next to the device to read the calendar" `[WIRED]` |
| 6 | Tasks/chores model gaps and bugs (recurrence drift, no post-hoc assignees, no copy, routines can't skip days, widget gaps) | MT, CLJ, TBTL | ~15 | "No matter how carefully I set up recurring chores ... the tasks eventually become inaccurate" `[AS-RSS 2026-06-06]` |
| 7 | Rewards half-built (text-only, app-only management, no audit) and no role separation | TBTL, SFL | ~4 | "All users have admin privileges" `[AS-RSS 2026-07-02]` |
| 8 | Lists sandboxed (no AnyList etc.), no staples/master list, list sync bugs | VERGE, REV26, SG26, TBTL | ~13 | "These repeating items are lost forever once completed" `[AS-RSS 2026-10-07]` |
| 9 | Meal/recipe flow: dumps all ingredients, fixed categories, flow navigates away | VERGE, WIRED, REV26 | ~5 | "I don't need four separate instances of '2 tablespoons of olive oil.'" `[VERGE]` |
| 10 | No offline; Wi-Fi 2.4 GHz only; no battery | TBTL, BH, TOH, REV23, GS, EVERYMOM | ~3 | "you cannot see your calendar" in a dead zone `[AS-RSS 2026-10-23]` |
| 11 | Too bright at night / no dark mode / sleep schedule too coarse | VERGE, THREADS, SFL | 0 | "despite auto-brightness, the screen is a bit too bright at night" `[VERGE]` |
| 12 | Notifications: too few (2 max, no event-added), and too many of the wrong kind (What's New, review prompts) | SG26 | ~7 | "abusing push notifications to ask for an app review" `[AS-RSS 2026-07-28]` |
| 13 | Limited customization (colors, fonts, layout, 24-hour time, Home view) | SG25, TBTL | ~1 | "no option to change things like the colors, fonts, or layout" `[SG25]` |
| 14 | Adoption burden: needs one person to run it; whole family must commit | WIRED, KN, CLJ, MT, SFL ("Regret" thread) | n/a | "you have to prepare your family for a full conversion" `[WIRED]` |

## 4. Top feature requests

Status column uses Skylight's public roadmap (Notion board, last edited
2026-10-16) `[RM]`. "Shipped" means the request is now table stakes for a
credible clone.

| Request | Evidence | Skylight status |
|---|---|---|
| Dark mode / night theme | VERGE, THREADS | Not on roadmap |
| Notify when someone adds/edits an event | AS-RSS x3 | In progress |
| More than two reminders per event | AS-RSS 2026-09-08, 2026-08-08 | Not on roadmap |
| Do everything on the device (stars, rewards, profiles) | SFL, AS-RSS 2026-06-04 | Stars on device: shipped; rest partial |
| Roles: parent vs kid; kid app access; per-kid lock on check-off | AS-RSS 2026-07-02, 08-28, 06-25, 06-19 | Parental lock (device-wide PIN) shipped; roles not on roadmap |
| Pictures on chores/lists for pre-readers and autistic kids | AS-RSS 2026-06-06, KN | Emoji only; not on roadmap |
| Sub-tasks / task breakdown | AS-RSS 2026-09-21 | Task descriptions shipped; sub-tasks not |
| Copy/duplicate events and tasks; event templates | AS-RSS 2026-10-06, 08-26, 06-22 | Not on roadmap |
| Master/staples grocery list; notes and quantities on items | AS-RSS 2026-10-07, TBTL | Not on roadmap |
| Sync lists/recipes/meals with outside apps (AnyList, Mealie, Tandoor) | VERGE, REV26, SG26, HA | Instacart, Walmart+ only |
| Custom recipe categories; selective ingredient add; merge duplicates | VERGE, AS-RSS 2026-07-07, 09-06 | "Organize" (aisle sort, consolidate) Plus |
| Weekday/weekend sleep schedule | SFL | Screensaver schedule in progress |
| 24-hour time | AS-RSS 2026-10-28, HELP-24H | Not on roadmap |
| Offline viewing | AS, AS-RSS 2026-10-06 | Not on roadmap |
| Open API / Home Assistant integration; screen on/off control | HA thread (2024-2026) | "does not offer a public Open API" (Apr 2026) |
| Attach photos/flyers to events | AS-RSS 2026-10-22 | Not on roadmap |
| Print weekly schedule | AS-RSS 2026-06-09 | Not on roadmap |
| Birthday age display | AS-RSS 2026-10-01 | Birthday celebration treatment (status blank) |
| Wider calendar / adjustable Home layout | AS-RSS 2026-08-29, TBTL | Home "Customize" toggles only |
| Auto-dismiss alerts | SG26 | Not on roadmap |
| Timer, whiteboard | (Skylight-originated) | In progress |

Shipped in 2024-2026 per `[RM]` and therefore expected by users: portrait
orientation; smaller font/density; start week Sun/Mon; shade weekends / dim
past days; striped multi-profile events; joined multi-day events; event
countdowns; meals-in-calendar setting; profile pictures/avatars; profiles vs
labels; delete profiles; routines with drag reorder; Up for Grabs; skip
tasks; repeat-after-completion; Track Habits; task due + completed
notifications; tasks week view; parental lock; multi-device linking; Home
view; hide tabs; 10-day weather in week/month; weather + next events on
screensaver; emoji search; Spanish; Apple two-way sync; web app; widgets.

## 5. Competitors and DIY alternatives

Prices as listed on vendor pages or reviews in 2025-2026. Vendor claims are
marked "(vendor)". Source URLs are inline in this section and section 6.
"Aloha Calendar" could not be found as a product; the closest match is an
unreviewed ALOLG 15.6-inch Amazon listing. The current state of Google's
Family Bell and Family Notes under Gemini for Home is unverified.

| Product | Type | Price (hw + sub) | Better than Skylight | Worse than Skylight | Sources |
|---|---|---|---|---|---|
| Hearth Display | 27" portrait-only wall display | $699; membership **required for setup**: $9/mo, $86.40/yr | Routines with Card view (one big icon tile + Done) and List view; stars per routine step with animations; streaks; "Cash out" reward flow with pinned goal; negative stars with reason; Privacy Mode wallpaper after idle; "Lights off" bedtime dimming; caregiver info; pet profiles; Hearth Helper photo-to-event | Most expensive; no free mode; one size/orientation; "clunky and slow-ish" `[KN]`; iCal view-only `[TOHvH]`; CR found fewer features than Skylight `[CR]` | https://hearthdisplay.com/products/hearth-display , https://hearthdisplay.com/products/family-membership , https://hearthdisplay.com/pages/features , https://hearthdisplay.com/blogs/hearth-at-home/the-magic-of-hearth-s-routines |
| Cozyla Calendar+ 2 | Android touchscreen 15.6"-32" | $349.99 (15.6") to $1,099.99 (32" 4K); optional Super $69.99/yr (AI voice, art) | Nearly all Skylight Plus features free: routines/chores with points, rewards, habits, meal plan, recipes, grocery list from meals, pantry tracker with expiry, Smart Import, sleep, parental lock, device linking; confetti on finishing the day; runs Play Store apps; battery stand option | T3 hit sync failures ("almost a deal breaker") fixed only by opening the phone app; T3 calls Skylight "more reliable for syncing calendars" and more refined | https://www.t3.com/home-living/smart-home/cozyla-calendar-2 , https://www.cozyla.com/products/calendar-plus-2-digital-calendar |
| Amazon Echo Show 15 / 21 | Alexa smart display | $299.99 / $399.99; Alexa+ free with Prime, else $19.99/mo | Shared calendar, sticky notes, to-do and shopping widgets; Visual ID shows a recognized person their own notes/reminders; Alexa+ extracts events from emails/flyers | No chore chart; mostly voice entry; cannot show calendar full-time; ads; small calendar view `[VERGE]` `[KN]` | https://press.aboutamazon.com/2021/9/amazon-introduces-echo-show-15-to-help-keep-families-organized-connected-and-entertained , https://www.aboutamazon.com/md/news/devices/new-alexa-top-features |
| Google Nest Hub (2nd gen) | 7" display | about $70-100 | Family Bell: scheduled chime opens an on-screen checklist with sound/animation per tick; Family Notes pinned to a corner | Small; no chores/rewards; features date from 2020-21; Assistant being replaced by Gemini for Home | https://www.slashgear.com/google-nest-hub-adds-morning-checklist-to-help-kids-get-ready-for-school-11686268 , https://9to5google.com/2020/11/18/nest-hub-family-notes/ , https://blog.google/products/google-nest/gemini-for-home/ |
| Mango Display | Software for TVs, tablets, browsers | Free (2 screens, no calendar sync); Pro $5.99/mo or $59.99/yr | Runs on hardware you own, including TV with remote; drag-and-resize layout editor; display schedules by time of day; night layout; one lane per child | Core features paywalled; mostly passive | https://mangodisplay.com/pricing/ , https://mangodisplay.com/chores , https://mangodisplay.com/features/ |
| Apolosign | Wall calendar 15.6"/21.5"/27" | $279-$579 sale, no subscription (vendor) | Calendar, chores, points/rewards, to-dos free for life (vendor) | No independent reviews found | https://www.apolosign.com/collections/digital-calendar |
| Dragon Touch | Wall calendar 10"-32" | 21.5" about $349.99; only magic import paid | Progress bars toward long-term reward goals; per-child accounts | Needs constant Wi-Fi | https://thegadgetflow.com/blog/dragon-touch-digital-calendar-review/ |
| Sense Hub | App with tablet "Hub mode" | Free tier; Premium $6.99/mo or $59.99/yr | Runs on any tablet; one-toggle lock to app; brightness follows time of day | Self-reported claims only; author of `[GS]` | https://getsense.ai/sense-hub |
| Cozi | Phone/web family organizer | Free (ads, calendar limited to next 30 days since May 2024); Gold $39/yr; Max $79.99/yr | Color dot per attendee plus "All" tag; recipe box to meal plan to shopping list; ALL-CAPS line becomes a list section; shopping mode moves checked items down; recipe ingredients grouped under recipe title | No wall/kiosk mode; free-tier cut hurt reputation | https://www.cozi.com/cozi-gold/ , https://www.cozi.com/faq/ |
| DAKboard | Display software + optional hardware | Free / $6 / $10 per mo; Touch 22 $599.95, Touch 27 $799.95 | Pixel-level block layouts, 100+ integrations; TouchHub dock of 4-6 big icons; Auto-Return to a default screen after idle; chores with points, leaderboard, Child Lock (kids can only check off); time-based text blocks; commute block turns red | Chores need paid tier; meal planner "coming soon"; free tier "way too limited" (HN comment, search snippet) | https://dakboard.com/pricing , https://blog.dakboard.com/meet-touchhub-bring-order-to-the-daily-family-shuffle/ |
| MagicMirror2 | Open-source Electron display | Free | Huge module ecosystem; MMM-Chores has separate admin web UI and read-only role | Passive display; touch/chores are add-ons | https://github.com/MagicMirrorOrg/MagicMirror , https://github.com/PierreGode/MMM-Chores |
| Home Assistant panels | Lovelace cards on any tablet | Free (+ Fully Kiosk $10.99/device) | Presence-aware, approval workflows, unlimited theming | YAML/HACS setup burden | see section 6.2 |
| TRMNL / e-ink | e-ink display | $139-$219; DIY kit $45 | Months per charge; self-hostable | Read-only; ~15 min refresh | https://trmnl.com , https://liliputing.com/trmnl-is-a-139-wifi-enabled-e-ink-display-with-open-source-firmware-you-can-also-make-one-from-a-jailbroken-kindle/ |

Conflict noted: Cozyla says dashboard widgets can be resized; DAKboard's
comparison page says they cannot
(https://dakboard.com/c/comparisons/dakboard-vs-cozyla/).

Head-to-head verdicts from reviewers: Skylight beat Hearth on value
`[TOHvH]` and core calendar `[CR]`; Hearth won on kid self-service routines
in a Hearth-sponsored piece `[QE]`; readers of `[KN]` preferred Skylight.

## 6. Borrowable ideas

### 6.1 From commercial products (ranked by value to our build, inference)

1. **Two task presentations for two audiences** (Hearth): Card view, one
   large illustrated step with a single Done button, for pre-readers; List
   view for older kids. Addresses Skylight's pre-reader and "kids don't
   engage" gaps `[KN]` `[QE]` `[AS-RSS 2026-06-06]`. Image:
   `comp-hearth-routine-views.png`.
2. **Check-only kid mode** (DAKboard Child Lock): kids can tick their own
   tasks, nothing else. Pairs with a per-kid PIN or avatar confirm (HA
   Family Hub kiosk PIN, portal-calendar per-kid PIN). Fixes "kids can add random rewards/stars"
   `[AS-RSS 2026-07-02]`.
3. **Reward loop with feedback** (Hearth, Cozyla, Dragon Touch): stars fly in
   on completion; whole-day completion triggers confetti; a pinned goal with
   progress bar; "Cash out" flow; parent adjustments with reason (negative
   stars). Skylight's rewards are "text labels" `[TBTL]`.
4. **Scheduled triggers for routines** (Nest Family Bell): a chime at a set
   time opens that profile's checklist on the wall screen.
5. **Display states by time of day** (Hearth Privacy Mode, Hearth "Lights
   off", Mango night layout, Sense brightness by time): ambient, active,
   privacy (calendar hidden, weather/clock only), night (dark, dim), sleep
   (off). Skylight has only sleep `[VERGE]`.
6. **Auto-return to a default screen** after idle (DAKboard), so the wall
   always comes back to Home or Calendar.
7. **Per-person column header** with avatar, star balance, progress ring,
   and time-of-day chip filters (Cozyla); matches Skylight's pattern and
   adds the ring. Image: `comp-cozyla-tasks-board.jpg`.
8. **List mechanics** (Cozi): shopping mode sinks checked items; recipe
   ingredients grouped under the recipe title; type-to-create section
   headers. Pantry with expiry (Cozyla) is optional.
9. **Family dashboard header** (Hearth): family name, avatars row, today's
   events as color bars, then routines, meals, to-dos. Image:
   `comp-hearth-family-dashboard.jpg`.
10. **Bottom dock** of large screen icons (DAKboard TouchHub) as an
    alternative to Skylight's narrow left rail for kids (inference: larger
    targets). Image: `comp-dakboard-layout-dock.jpg`.
11. **Caregiver/babysitter info card** (Hearth): allergies, emergency
    numbers. Low cost, high value for a wall screen (inference).

### 6.2 From DIY and open-source projects

| Repo | Stars | Last push | Stack | Ideas worth taking |
|---|---|---|---|---|
| [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard) | 1647 | 2026-11-04 | Python, ADB | Roots locked Android frames (incl. Skylight). Derivative huntsyea/kitchen-frame: 5-min idle clock, keeps last good events if a feed fails, `?diag` perf overlay, targets old WebView 106 |
| [timeframe/ha-addon](https://github.com/timeframe/ha-addon) | 879 | 2026-11-03 | Ruby | Calm e-paper dashboard; blank status area = healthy house `[HN-TF]` |
| [FamousWolf/week-planner-card](https://github.com/FamousWolf/week-planner-card) | 527 | 2026-04-26 | JS Lovelace | Base for most HA Skylight clones |
| [mohesles/my-skylight-calendar](https://github.com/mohesles/my-skylight-calendar) | 505 | 2026-02-10 | HA YAML | Person pills (plus Family, Birthdays, Holidays) as toggle filters, weather per day cell, big Add Event. Image: `comp-ha-skylight-clone-month.png` |
| [ccpk1/ChoreOps](https://github.com/ccpk1/ChoreOps) | 456 | 2026-09-29 | Python HA, GPL-3.0 | Claim then parent approve (hold to approve); bonuses/penalties; overdue reset; 7-day activity log |
| [JVarhol/HA-Family-Hub](https://github.com/JVarhol/HA-Family-Hub) | 183 | 2026-10-31 | JS HA | Planner view (rows = days, columns = people); meals atop each day; rotating/assigned/first-come chores; "Chore Bin" and "Waiting to Recur" columns; "Mark in progress"; flame streaks; Discreet Mode (hide names/text, keep colors/times); kiosk PIN; guest Wi-Fi QR. Image: `comp-ha-familyhub-chores.png` |
| [jwlerch78/dashie-android-app](https://github.com/jwlerch78/dashie-android-app) | 182 | 2026-08-28 | Kotlin, AGPL | Free Fully Kiosk alternative: motion wake, PIN, battery management, Fully-compatible API |
| [sandydargoport/prism](https://github.com/sandydargoport/prism) | 131 | 2026-11-04 | TS, Postgres, Docker | Setup wizard with per-member PIN; Microsoft To Do and Kroger cart push |
| [caspii/dinkydash](https://github.com/caspii/dinkydash) | 99 | 2026-11-04 | Python | Whose-turn rotation advances with the date (nothing to tick); `/preview` shows Pi, TV, tablet sizes side by side |
| [thefloppytaco/portal-calendar](https://github.com/thefloppytaco/portal-calendar) | 33 | 2026-10-20 | Kotlin | Overlapping events side by side in day timeline; portrait switches to one row per day; event titled `chore: ...` becomes a chore; chore quick-pick learns frequent chores; per-kid PIN |
| [lowerygt/OpenSkyLight](https://github.com/lowerygt/OpenSkyLight) | 28 | 2026-06-25 | Electron, TS, SQLite | Editable tile home behind PIN; >= 48 px targets; append-only star ledger; phone companion pairs by QR, served by the display; sleep window with tap-to-wake 5 min; dark mode at sunset |

Backends seen reused: donetick (chores; rotation, completion windows, NFC
mark-done), grocy, mealie. Users in the HA thread asked Skylight for Mealie
or Tandoor meal sync `[HA]`.

## 7. Tablet and kiosk notes

### 7.1 What reviewers say about the screen

- Readability distance: Skylight's default text is arm's-length text
  `[WIRED]`. The 27-inch Max fixed readability for a 4-person family, the
  15-inch did not `[VERGE]` `[MT]`. Color coding is the part that reads from
  a distance `[TBTL]` `[TOH]`.
- Night: too bright at night even with auto-brightness; sleep schedule is
  the only mitigation `[VERGE]` `[THREADS]`.
- Placement: kitchen pass-through spot works best `[CR]`; counter placement
  gets food splatter `[REV26]`; fingerprints at kid height `[GS]` `[T3]`;
  needs an outlet, cord covers not included (Hearth) `[TOHvH]`.
- Glanceability is the core value: "just there when you need it" `[SG26]`;
  screensaver that hides the calendar until tapped hurts glanceability
  `[SG26]` `[SG25]`, which is why Skylight added weather + next two events on
  the screensaver `[TBTL]`.

### 7.2 Sizing rules for a tablet web app (inference from cited guidance)

- Signage legibility guidance: minimum letter height about 0.05 in per foot
  of viewing distance, comfortable about 0.1 in per foot `[DSIG]`. At a 6 ft
  kitchen glance that is 0.3 in minimum, 0.6 in comfortable.
- On a typical 10-11 inch tablet at roughly 130 CSS px per inch (inference
  from iPad 10.9-inch: 1180 x 820 CSS px), 0.3 in cap height needs about a
  55-60 px font. So no tablet will show a full week legibly from across the
  room (inference). Design two tiers: a glance tier (clock, today's next 2-3
  events, weather, per-person "done/total") at 48-96 px, and a walk-up tier
  (week/month detail, lists) at 16-22 px.
- Touch targets: WCAG 2.2 requires at least 24 x 24 CSS px (2.5.8, AA) and
  recommends 44 x 44 (2.5.5, AAA) `[WCAG]`; the OpenSkyLight project uses
  at least 48 px (section 6.2). For wall-mounted standing use and kids, use
  56-64 px check targets with generous spacing (inference). Skylight's event
  alert OK button was "hard to reach" `[SG26]`.

### 7.3 Kiosk browsers and always-on hardware

- Android: Fully Kiosk Browser is the standard wall-panel shell. Motion wake
  and screensaver are PLUS features, EUR 8.90 / $10.99 per device, one-time
  `[FKB-LIC]`. Common recipe: OS screen timeout "never", Fully screensaver
  after 60 s with `fully://color#000000` as wallpaper, "Exit Screensaver on
  Motion" on; a known bug wakes the screen at very low brightness, so an
  automation resets brightness on wake `[YM]`. Reports of wake-reliability
  issues `[FKB-HA]`.
- Camera motion detection is oversensitive to light changes; one user moved
  to a Zigbee motion sensor `[HA-WALL]`. An HA blueprint turns the screen on
  with motion and off after 5-300 s, restarting the delay on new motion
  `[HA-BP]`. Free alternative to Fully: dashie-android-app (motion wake, PIN,
  battery management, Fully-compatible API) (section 6.2).
- HN wall-panel builders: muted colours on a black background on an OLED
  tablet in Fully Kiosk, screen woken by Zigbee motion sensors, placed where
  nobody lingers in view; webcam motion detection with 30 s auto-off; an old
  iPad "connected to the charger 24/7 and runs in Kiosk mode" `[HN-TF]`.
  Skeptic: "it assumes the teens will bother to look at it" `[HN-TF]`.
- iPad: Guided Access locks to one app (Settings > Accessibility > Guided
  Access) and needs a passcode/Face ID to exit; Auto-Lock interaction needs
  testing; kiosk wrapper apps (tKiosk, DashPad) add auto-reload and idle
  screens `[IPAD]`.
- Web Screen Wake Lock API: iOS Safari supports it fully from 18.4; between
  16.4 and 18.4 it did not work in Home Screen web apps (WebKit bug 254545)
  `[WAKELOCK]`. Fallback: rely on kiosk app or OS auto-lock "Never"
  (inference).
- Burn-in: avoid OLED for static dashboards; about 10 inches is the minimum
  for comfortable tap targets `[HAG]`. LCD tablets plus a moving or
  dimming ambient state are the safe default (inference).
- Battery swelling: always-plugged wall tablets swell `[BATT]`. Use an OS
  charge limit where available (Lenovo caps at 60%, some devices at 80%)
  `[HAG]`, otherwise a smart plug cycling charge by battery level; mount with
  a visible gap `[BATT]`.
- Old WebViews: wall hardware is often old Android; one Skylight-replacement
  project targets WebView 106 and ships a `?diag` performance overlay
  (kitchen-frame, section 6.2). Keep the bundle light and test on a low-end
  tablet (inference).
- Reviewers count the absence of a battery as a con for Skylight `[REV23]`
  `[TOH]`; a tablet gives the clone a battery-backed display through power
  cuts, at the cost of swelling risk (inference).

## 8. Recommendations for our build

All items in this section are **(inference)** drawn from the evidence above;
the bracketed keys point to the evidence that motivates each one.

### 8.1 Replicate faithfully

1. **Shell and visual grammar.** Left tab rail (Home, Calendar, Lists, Tasks,
   Rewards, Meals, Recipes, Sleep, Settings), header with date, time, weather,
   right-aligned view/filter/prev/Today/next controls, bottom-right "+" FAB,
   rounded profile-colored event tiles with avatar badges, "N events" and a
   weather icon per day header, striped tiles for multi-profile events, serif
   display type. Reviewers consistently praise the at-a-glance color coding
   and calm look `[TBTL]` `[TOH]` `[DT24]` `[AP26]`.
2. **Views.** Day, week, month, schedule (hour timeline, 1-N days), plus Home
   (calendar card + today's tasks per profile). Month: start-on-current-week
   option, swipe paging, Today button `[REV26]` `[RM]`.
3. **Profiles vs labels**, color + avatar per profile, filter by profile or
   source calendar, unlimited profiles `[RM]` `[REV26]` `[TOH]`.
4. **Duplicate-event merge.** The same event on two family calendars shows
   once with both colors `[WIRED]` `[CLJ]`.
5. **Routines vs chores.** Routines bucketed morning/afternoon/evening and
   reset daily; chores with due dates that roll over and show "N days late";
   Up for Grabs column; per-person done/total and star totals; week grid;
   skip; repeat-after-completion; streaks `[CLJ]` `[TOH]` `[TBTL]` `[RM]`.
   These are the features parents credit with changing kid behavior `[TP]`
   `[CLJ]` `[BH]`.
6. **Stars to rewards** with kid-chosen rewards and per-task star values
   `[TOH]` `[CLJ]`.
7. **Lists** (multiple, sections, drag reorder, check-off) and **meals** (week
   grid by meal type, free-text meals, recipe-linked meals, toggle meals on
   the calendar) `[TBTL]` `[REV26]` `[WIRED]`.
8. **Sleep schedule, device-wide parental PIN, hide tabs, multi-device
   household** `[REV26]` `[RM]` `[TBTL]`.
9. **Messages takeover** (sticky note that stays until "Ok!", optional
   read-aloud via Web Speech): cheap to build and the best-reviewed recent
   Plus feature `[TBTL]`.

### 8.2 Improve on Skylight

1. **No paywall and no upsell UI.** The single largest complaint `[AS-RSS]`
   `[WIRED]` `[VERGE]`. Everything is on.
2. **Device-complete.** Every setting, profile, star, reward, and recurrence
   editable on the tablet behind a parent PIN; the phone/web companion is the
   same web app with a different layout, never a requirement `[SFL]`
   `[AS-RSS 2026-06-04]` `[TBTL]`.
3. **Roles.** Parent (admin), member/teen (own events, lists), kid (complete
   own tasks only), wall device (kiosk). Optional per-kid PIN or "tap your
   avatar" confirm before checking off; optional parent approval before stars
   post; an append-only star ledger with who/when/reason and undo. Kid mode
   is check-only, as in DAKboard Child Lock and OpenSkyLight's ledger
   (section 6) `[AS-RSS 2026-07-02, 08-28, 06-25]` `[TBTL]`.
4. **Sync done properly.** Google Calendar API two-way with push
   notifications (watch channels) rather than slow polling; CalDAV two-way for
   iCloud; Microsoft Graph two-way where the tenant allows; ICS read-only.
   At connect time the user maps each source calendar to a profile or label
   (no auto-profile-per-calendar) and picks the write-back calendar per
   profile. Show a "last synced" stamp and a sync-error badge. Store
   timestamps in UTC with an explicit household time zone and test DST
   boundaries (Skylight's wrong-time bug) `[TBTL]` `[SG25]` `[MT]` `[SFL]`.
5. **Offline-first wall display.** Cache the last snapshot (service worker +
   IndexedDB) so the tablet keeps showing today and this week through Wi-Fi
   drops; queue edits `[AS]` `[TBTL]` `[BH]`.
6. **Display states, not just sleep.** Active, ambient (clock, weather,
   next events, per-person progress), privacy (calendar text hidden, colors
   and times or just clock/weather; Hearth Privacy Mode, HA Family Hub
   Discreet Mode), night (dark theme, dimmed), and sleep (off). Each on a
   weekday/weekend schedule; tap or motion to wake; auto-return to Home after
   idle (DAKboard). A dark theme is cheap in a web app `[VERGE]` `[THREADS]`
   `[SFL]` `[SG26]`.
7. **Readability tiers.** Glance tier (clock, next events, per-person
   progress) sized for 2-3 m; detail tier for walk-up. User font scale and
   density, 24-hour option, month view with "+N more" and tap-to-expand day,
   portrait and landscape layouts `[WIRED]` `[REV26]` `[MT]` `[HELP-24H]`.
8. **Tasks.** Add/remove assignees after creation; duplicate; task box /
   templates; sub-task checklist with collapse; picture or emoji icons for
   pre-readers; routines on chosen weekdays; widget/home lists include Up for
   Grabs `[AS-RSS 2026-08-26, 09-21, 06-06]` `[MT]`. Offer Hearth-style Card
   view (one big illustrated step, one Done button) next to the list view for
   pre-readers; whose-turn rotation chores (dinkydash, Family Hub); an
   optional scheduled chime that opens a routine (Nest Family Bell).
9. **Rewards** with image, note, history, pinned goal with progress bar,
   stars animating in on completion, end-of-day celebration, and a
   kid-initiated "cash out" that a parent approves `[TBTL]` (Hearth, Cozyla,
   Dragon Touch, ChoreOps in sections 5-6).
10. **Lists and meals.** Staples/master list with "add again"; quantity and
    note per item; selective ingredient add with merge of duplicates; return
    to Meals after adding ingredients; custom recipe categories/tags and
    search; URL recipe import via schema.org Recipe JSON-LD (non-AI, so
    outside the Magic Import exclusion) `[VERGE]` `[WIRED]` `[AS-RSS 2026-10-07,
    09-20, 07-07]`.
11. **Notifications.** Configurable multiple reminders per event, "someone
    added/changed an event" digest, task due and completed pushes; wall
    alerts auto-dismiss after a timeout; no marketing or review prompts
    `[AS-RSS 2026-09-08, 10-19, 07-28]` `[SG26]`.
12. **Quality gates.** Automated tests for date navigation across months and
    years (Skylight's June 2026 release broke navigation past December), for
    recurrence expansion, and for sync conflicts `[AS-RSS 2026-06-24..07-02]`.
13. **Small wins users asked for.** Copy event, attach a photo/flyer to an
    event, print-friendly week view (CSS print stylesheet), age on recurring
    birthdays `[AS-RSS 2026-10-06, 10-22, 06-09, 10-01]`.
14. **Small wins from competitors.** Overlapping events side by side in the
    day timeline (portal-calendar); caregiver/babysitter card with allergies
    and emergency numbers (Hearth); guest Wi-Fi QR (HA Family Hub); Cozi-style
    shopping mode (checked items sink) and recipe-grouped ingredients;
    companion pairing by QR code shown on the wall screen (OpenSkyLight).

### 8.3 Drop or defer

- Subscription tiers, upsell surfaces, "What's New" takeovers, review prompts
  `[AS-RSS]`.
- Out of scope by brief: Disney Mode, Magic Import/Sidekick (including AI
  meal plans and the Activity Planner), photo screensaver.
- Defer: grocery ordering (Instacart, Walmart+), Alexa skill, seasonal
  designs, whiteboard, timers. None appears in user complaints as missing
  (inference from absence in `[AS-RSS]` and reviews).
- Hardware-only concerns (snap frames, stands, magnets) do not apply; the
  tablet-specific equivalents are in section 7.

## Sources

Reviews (Skylight):

- `[TBTL]` Tech Between the Lines, J. Scharlemann, "Skylight Calendar 2 Review: A Genuinely Useful Device That Can't Quite Get Out of Its Own Way", 2026-07-14, upd 2026-10-21. https://www.techbetweenthelines.com/skylight-calendar-2-review-a-genuinely-useful-device-that-cant-quite-get-out-of-its-own-way/
- `[REV26]` Reviewed, L. Harrington, "Skylight Calendar 2 Review", 2026-07-08. https://www.reviewed.com/smarthome/content/skylight-calendar-2-review
- `[AP26]` Android Police, S. Radochia, "I hate smart home tech, but the Skylight Calendar 2 is an exception", 2026-04-09. https://www.androidpolice.com/i-hate-smart-home-tech-but-the-skylight-calendar-2-is-an-exception/
- `[WIRED]` Wired, N. Farrell, "Review: Skylight Calendar 2", 2026-03-17, 7/10. https://www.wired.com/review/skylight-calendar-2/
- `[SG26]` SlashGear, A. Doud, "Skylight Calendar 2 Review: How To Sync Your Life On A Digital Display", 2026-02-19. https://www.slashgear.com/2105122/skylight-calendar-2-review-features-specs-price/ (syndicated: https://www.aol.com/articles/skylight-calendar-2-review-sync-143527520.html)
- `[GS]` Sense (competitor), "Skylight Calendar 2 Review (2026)", upd 2026-10-12. https://getsense.ai/blog/posts/skylight-calendar-2-review-2026
- `[FORBES]` Forbes Vetted, "The 6 Best Digital Calendars, Tested In Our Own Busy Homes" and "Skylight Calendar 2 Review 2026" (403; search snippets only). https://www.forbes.com/sites/forbes-personal-shopper/article/best-digital-calendar/ , https://www.forbes.com/sites/forbes-personal-shopper/article/skylight-calendar-2-review/
- `[CR]` Consumer Reports, A. Lashbrook, "Best Digital Wall Calendars" / "Hearth vs. Skylight", upd 2026-08-14 (paywalled; intro + snippets). https://www.consumerreports.org/electronics-computers/best-digital-calendars-a1935397155/
- `[QZ]` Quartz, "Consumer Reports tests 4 digital wall calendar displays for families" (snippet). https://qz.com/digital-wall-calendars-consumer-reports
- `[MT]` Motherhood Together (Substack), "My Honest Review of the Skylight Calendar after 3 Months", 2026-09-09. https://motherhoodtogether.substack.com/p/my-honest-review-of-the-skylight
- `[CLJ]` Chris Loves Julia, "Our Skylight Calendar Review (+ Setup Tips for Busy Families)", 2026-07-22. https://chrislovesjulia.com/skylight-calendar-review/
- `[TOH]` Taste of Home, M. Hillman, "Skylight Calendar Review: A Busy Mom's Honest Take", 2026-06-07. https://www.tasteofhome.com/article/skylight-calendar-review/
- `[TOHvH]` Taste of Home, M. Hillman and M. Henn, "Skylight vs. Hearth: We Tested Two Popular Digital Calendars", 2026-07-30. https://www.tasteofhome.com/article/skylight-vs-hearth/
- `[BH]` Bless'er House, "Our Family Tried the Skylight Calendar - Here's What We Loved & Didn't", 2025-07-31, upd 2026-09-30. https://www.blesserhouse.com/our-family-tried-the-skylight-calendar-heres-what-we-loved-didnt/
- `[VERGE]` The Verge, J. Pattison Tuohy, "Skylight Calendar Max review: a game-changer for busy parents", 2025-02-20, upd 2025-02-21, 7/10. https://www.theverge.com/reviews/615523/skylight-calendar-max-sidekick-ai-assistant-review
- `[SG25]` SlashGear, E. Street, "Skylight Digital Calendar: The Pros, The Cons, And Is It Worth Your Money?", 2025-03-10. https://www.slashgear.com/1806004/skylight-digital-calendar-tested-pros-cons/
- `[KN]` Kelly Nolan, "Exploring Digital Calendar Displays: Skylight, Hearth, Dakboard and More", 2025-06-06 (+ reader comments). https://kellynolan.com/exploring-digital-calendar-displays-skylight-hearth-dakboard-and-more/
- `[DT24]` Digital Trends, J. Bitner, "Skylight Cal Max review", 2024-07-12. https://www.digitaltrends.com/home/skylight-cal-max-review/
- `[AP24]` Android Police, M. Bizzaco, "Skylight Calendar review: An intuitive family command center", 2024-07-06, 6/10. https://www.androidpolice.com/skylight-calendar-review/
- `[REV23]` Reviewed, A. Lane, "Skylight Calendar review: Perfect for busy families", upd 2023-08-30. https://www.reviewed.com/parenting/content/skylight-calendar-review-perfect-busy-families
- `[T3]` T3, "Skylight Smart Calendar review: an organiser's dream" (page truncated; search snippet only). https://www.t3.com/home-living/smart-home/skylight-smart-calendar-review-an-organisers-dream
- `[QE]` The Quality Edit, "Hearth Display vs. Skylight" (sponsored by Hearth), 2026-03-31. https://www.thequalityedit.com/articles/hearth-vs-skylight-review
- `[EVERYMOM]` The Everymom, "Is the Skylight Calendar Making My Life Easier?" (snippet). https://theeverymom.com/skylight-calendar-review/
- `[TG]` `[TR]` Tom's Guide and TechRadar deal/news posts only, e.g. https://www.tomsguide.com/home/smart-home/the-skylight-calendar-is-on-sale-right-now-and-its-built-to-organize-the-scheduling-chaos-in-your-life , https://www.techradar.com/computing/monitors/this-giant-27-inch-digital-calendar-is-here-to-organize-your-familys-life

User feedback and Skylight primary sources:

- `[AS]` Apple App Store, Skylight app (rating, visible reviews). https://apps.apple.com/us/app/skylight-app/id1438779037
- `[AS-RSS yyyy-mm-dd]` Apple customer-reviews RSS feed, 500 most recent US reviews, pulled 2026-11-04; date identifies the review. https://itunes.apple.com/us/rss/customerreviews/page=1/id=1438779037/sortby=mostrecent/json (pages 1-10)
- `[TP]` Trustpilot, Skylight Frame. https://www.trustpilot.com/review/skylightframe.com
- `[BBY]` Best Buy, Skylight Calendar 2 customer reviews (snippet; page timed out). https://www.bestbuy.com/site/reviews/skylight-calendar-2-15-inch-touchscreen-smart-calendar-and-chore-chart-charcoal/6665549
- `[SD]` Slickdeals thread, Skylight 15" at $239.99. https://slickdeals.net/f/18498841-skylight-15-smart-touchscreen-calendar-and-organizer-239-99
- `[SFL]` SmartFrameLab, "Skylight Calendar complaints: 7 checks before you buy", 2026-10-18 (paraphrases r/skylightcalendar). https://smartframelab.com/news/skylight-calendar-complaints-reddit/
  - Reddit threads it cites (not read by us): https://www.reddit.com/r/skylightcalendar/comments/1ssnh3o/feature_request_i_feel_misled_by_skylight_and/ ; https://www.reddit.com/r/skylightcalendar/comments/1p4dq4q/calendar_events_dont_sync/ ; https://www.reddit.com/r/skylightcalendar/comments/1tupxn6/anyone_else_having_a_spike_in_issues/ ; https://www.reddit.com/r/skylightcalendar/comments/1r5xng7/feature_suggestion_weekdayweekend_sleep_time/ ; https://www.reddit.com/r/skylightcalendar/comments/1v0onp1/was_super_excited_for_skylight_and_now_its/ ; https://www.reddit.com/r/skylightcalendar/comments/1oefuj5/every_synced_calendar_has_its_own_profile_now/ ; https://www.reddit.com/r/skylightcalendar/comments/1qi3xj0/regret/
- `[RM]` Skylight Calendar public roadmap (Notion), 102 items, last edited 2026-10-16. https://roadmap.ourskylight.com/484b83eda396400899300f233e692ff0 (data read via the page's public Notion API)
- `[HA]` Home Assistant Community, "Skylight calendar" thread, 2024-01 to 2026-04. https://community.home-assistant.io/t/skylight-calendar/671521
- `[HELP-FONT]` Skylight help, "How to increase font size on your Skylight Calendar". https://skylight.zendesk.com/hc/en-us/articles/32083058580763-How-to-increase-font-size-on-your-Skylight-Calendar
- `[HELP-24H]` Skylight help, "Does Skylight Calendar show military time?". https://skylight.zendesk.com/hc/en-us/articles/36058190127899-Does-Skylight-Calendar-show-military-time
- `[THREADS]` Stephen Robles on Threads (about Oct 2025): "Unfortunately no dark mode." https://www.threads.com/@stephenrobles/post/DPUPYJYEWQT/
- `[HN-TF]` Hacker News, "I built Timeframe, our family e-paper dashboard" (369 comments). https://news.ycombinator.com/item?id=47113728 ; DAKboard 37-inch comment https://news.ycombinator.com/item?id=47114506
- `[AMZ]` `[SKY]` Amazon listing "Skylight Calendar 2 ... Featured on Wirecutter" https://www.amazon.com/Skylight-Calendar-Touchscreen-Wirecutter-Interactive/dp/B0G618GK4S ; Skylight home page https://myskylight.com/

Tablet/kiosk:

- `[DSIG]` digitalsignage.com, "Typography & Viewing Distance Guide". https://digitalsignage.com/digital_signage/docs/guides/typography-viewing-distance
- `[WCAG]` W3C WCAG 2.2, SC 2.5.8 Target Size (Minimum) and SC 2.5.5 Target Size (Enhanced). https://www.w3.org/TR/WCAG22/#target-size-minimum
- `[FKB-HA]` Home Assistant Community, "Fully Kiosk Browser" thread and "Android Tablet Kiosk problems". https://community.home-assistant.io/t/fully-kiosk-browser/41675 ; https://community.home-assistant.io/t/android-tablet-kiosk-problems/991354
- `[YM]` "Smart Control of Your Wall-Mounted Tablet: Automating Screen On/Off with Home Assistant". https://smarthome.yoavmor.com/home-assistant/smart-control-of-your-wall-mounted-tablet-automating-screen-on-off-with-home-assistant/
- `[IPAD]` Homey Community, "How I wall-mounted my iPad Pro" https://community.homey.app/t/how-i-wall-mounted-my-ipad-pro ; tKiosk https://apps.apple.com/us/app/tkiosk/id1445440029 ; HA "iPad Dashboard Kiosk Solution" https://community.home-assistant.io/t/ipad-dashboard-kiosk-solution/507580
- `[WAKELOCK]` MDN browser-compat-data, WakeLock (Safari iOS 18.4 full; 16.4-18.4 partial, not in Home Screen web apps, WebKit bug 254545). https://chromium.googlesource.com/external/github.com/mdn/browser-compat-data/+/73d346309ee9d8be7e32fda8ff574d4c79dd4c51/api/WakeLock.json
- `[BATT]` openHAB Community, "Wallmount tablet: battery handling" https://community.openhab.org/t/wallmount-tablet-battery-handling-always-100-charged-or-maintain-battery-at-a-certain-level/157486 ; "Bloated Battery in Tablet - Fire Hazard" https://community.openhab.org/t/bloated-battery-in-tablet-fire-hazard/145821 ; SmartThings "Do you leave your smart home tablet plugged in 24/7?" https://community.smartthings.com/t/do-you-leave-your-smart-home-tablet-plugged-in-24-7/246866

Kiosk sources added from the competitor pass:

- `[FKB-LIC]` Fully Kiosk PLUS license. https://www.fully-kiosk.com/docs/en/legal/fully-plus-license
- `[HA-WALL]` Home Assistant Community, "HA on my wall". https://community.home-assistant.io/t/ha-on-my-wall/145998
- `[HA-BP]` Home Assistant Community, "Blueprint: intelligent wall tablet screen control on/off on motion". https://community.home-assistant.io/t/blueprint-intelligent-wall-tablet-screen-control-on-off-on-motion/1016447
- `[HAG]` Home Assistant Guide, "The best tablet to display your Home Assistant dashboard". https://home-assistant-guide.com/guide/the-best-tablet-to-display-your-home-assistant-dashboard/

Competitor and GitHub sources are inline in sections 5 and 6. Hearth,
Cozyla, and Apolosign prices were read from their public product pages
(Shopify product JSON) because WebFetch was rate-limited (HTTP 429) there.
GitHub star counts and last-push dates were read via the GitHub API on
2026-11-04.

Images saved in `assets/reviews/` (from review articles and vendor/GitHub
pages; used here only as UI reference). Competitor images:

| File | Shows | Source |
|---|---|---|
| `comp-hearth-routine-views.png` | Hearth routine List view (icon, label, check) beside Card view (big icon, Done) | https://cdn.shopify.com/s/files/1/0554/9126/4661/files/List_and_Card_View.png |
| `comp-hearth-family-dashboard.jpg` | Hearth portrait family dashboard: rhythm score, avatars, today's events, routines, meals | https://hearthdisplay.com/cdn/shop/files/Family_Dashboard.png |
| `comp-cozyla-tasks-board.jpg` | Cozyla per-person task columns: star balance, time-of-day chips, Morning and Chores sections, "45 stars earned today" | https://cdn.mos.cms.futurecdn.net/HNgEpxvN3sJXtiXnYthiB8-1280-80.jpg (T3 review) |
| `comp-dakboard-layout-dock.jpg` | DAKboard block layout with TouchHub dock | https://blog.dakboard.com/wp-content/uploads/2026/07/Touchhub-screen-spotlight.png |
| `comp-ha-skylight-clone-month.png` | HA Skylight-clone month view: person/category filter pills, weather per day, Add Event | https://raw.githubusercontent.com/mohesles/my-skylight-calendar/main/assets/sky2.png |
| `comp-ha-familyhub-chores.png` | HA Family Hub chores: person columns, stars, streak flames, Done / Mark in progress, Chore Bin, Waiting to Recur | https://raw.githubusercontent.com/JVarhol/HA-Family-Hub/main/images/readme/card-chores.webp (converted to PNG) |

Skylight review images:

| File | Shows | Source |
|---|---|---|
| `rev-tbtl-home-view.jpg` | Cal 2 Home view: 7-day calendar card + "Today's Tasks" per profile, Customize button | `[TBTL]` https://www.techbetweenthelines.com/content/images/2026/07/IMG_7418-1.jpeg |
| `rev-tbtl-tasks-day-upforgrabs.jpg` | Tasks Day view: Up for Grabs column with "N days late", Morning/Evening routine chips, star and streak chips | `[TBTL]` https://www.techbetweenthelines.com/content/images/2026/07/IMG_7417.jpeg |
| `rev-tbtl-messages-popup.jpg` | Messages takeover over Calendar; also header buttons, profile chips, striped multi-profile event, Dinner chip | `[TBTL]` https://www.techbetweenthelines.com/content/images/2026/10/skylight-messages-calendar.jpg |
| `rev-tbtl-device-navigation.jpg` | Settings > General > Device Navigation tab toggles | `[TBTL]` https://www.techbetweenthelines.com/content/images/2026/10/skylight-device-navigation.jpg |
| `rev-reviewed-tasks-week.jpg` | Tasks Week view grid with check circles per day | `[REV26]` https://images.reviewed.com/fit-in/1200x0/filters:strip_icc():strip_exif():no_upscale():format(jpeg):quality(80)/attachment/cbb24d8b0f3e4f4e/Untitled_design__15_.png |
| `rev-reviewed-meals-week.jpg` | Meals week grid, Breakfast/Lunch/Dinner/Snack rows | `[REV26]` https://images.reviewed.com/fit-in/1200x0/filters:strip_icc():strip_exif():no_upscale():format(jpeg):quality(80)/attachment/477b966ad02240aa/skylight-mealplan.png |
| `rev-reviewed-recipe-detail.jpg` | Recipe box master-detail with category chips, Add to Grocery List, Plan Meal | `[REV26]` https://images.reviewed.com/fit-in/1200x0/filters:strip_icc():strip_exif():no_upscale():format(jpeg):quality(80)/attachment/385e45b4426442e9/2.png |
