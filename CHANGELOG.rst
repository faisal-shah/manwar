=========
Changelog
=========

0.3.4 (2026-11-06)
==================

A bug hunt across the wall, the phone and the server.

Changed
-------

- The family's location is set once, in Settings > Location (or More >
  Prayer times on a phone); the weather and the prayer times both use
  it, and the location already set carries over by itself. The prayer
  clock follows the household's time format and temperature unit.
- Grocery suggestions put items whose name starts with what is typed
  first; the items bought most rise among close matches. A quantity
  typed first ("2 gal milk") still suggests milk, and a picked
  suggestion keeps it. Arabic items match with or without the article,
  and "البيض" and "بيض" are one item.
- Days the calendar has not loaded yet say "Not loaded yet" in every
  view, on the wall and on a phone that starts offline, instead of
  looking empty.

Fixed
-----

- Connecting Google again from Settings no longer drops the wall to the
  sign-in screen when it fails; a toast says how it went. A reconnect
  can no longer lose the new connection to a token request running at
  the same moment, connecting again always repairs a lost connection,
  and an update never reloads the page in the middle of a sign-in. The
  sign-in code is bound to the tablet that asked for it (PKCE).
- At night the prayer clock stays dark through the iqamah countdown and
  any athan whose sound is off.
- A note that arrives overnight is announced when someone wakes the
  wall, not when the Fajr athan lights it.
- A preview left running ends before the next real athan, and a preview
  can no longer silence a real athan. Updates wait for an athan due in
  the next few minutes, and an athan whose recording failed to load
  tries again.
- Saving an event changes who it is for, or its countdown, only when
  you changed them, so another tablet's assignment is kept. Editing a
  list item or a recipe keeps another device's change to the fields
  you left alone.
- Yearly countdowns, such as a birthday, no longer vanish for weeks
  after each occurrence when countdowns are set to Always.
- A calendar hidden in Settings stays hidden after the wall reloads
  offline, and changing a repeating event between all-day and timed
  keeps its deleted occurrences deleted.
- Taking the last person off a holiday in To assign puts it back in the
  queue.
- Recipe ingredients put on the list while the Add dialog was open are
  no longer added twice. An item unchecked offline after another device
  cleared it comes back unchecked.
- Undo no longer writes over an item added again since, or a check-off
  made on another device. Failed clears, deletes, undos and star
  changes say so.
- Sync now after a rate limit resumes the regular sync, and the phone
  stops fetching far-ahead days once you leave the agenda.
- The phone's Today shows a wall timer over an hour as 1:29:59, not
  89:59.
- A tablet clock set back no longer keeps the wall unlocked, awake or
  away from its resting face for that long.
- Right after a deploy, a browser could load the old page for up to an
  hour and find its scripts gone (a blank page).

0.3.3 (2026-11-05)
==================

Added
-----

- Grocery suggestions: every item put on a grocery list is remembered
  (shared by all grocery lists, started from what they hold), and Add
  item suggests matching ones as you type, the closest and the most used
  first. An item already on the list is marked; the trash next to a
  suggestion forgets it, with Undo.

0.3.2 (2026-11-05)
==================

Fixed
-----

- Signing in with Google ended with "The Google window was closed before
  finishing", in the installed app and in a Chrome tab on the tablet: the
  popup never handed its code back. Sign-in now goes to Google's page and
  comes back by redirect (a first visit waits a few seconds for the app to
  finish installing itself); only a browser without service workers uses
  the popup.

0.3.0 (2026-11-05)
==================

The prayer-time clock joins the wall as its second face, so the athan
sounds whatever the wall is showing.

Added
-----

- The prayer face: the Adhan Clock's themes (calligraphy, classic, kids,
  gallery, night), athan sequence, recordings, previews, photo library and
  settings, inside the wall. The rail's Prayer button and the prayer
  face's calendar button switch between the faces.
- Each athan sequence comes to the front over the family face, wakes a
  sleeping wall (Sleep now included; not for an athan whose sound is off)
  and hands the screen back when it ends; the wall's chimes and notes read
  aloud wait for it.
- A note or timer from a phone brings the family face. Settings → Display
  → Resting screen: the face the wall goes back to after three minutes
  without a touch, and at night (resting on the prayer face, its night
  clock replaces the black sleep screen).
- Phone: More → Prayer times edits the place, calculation, iqamah and
  Jumu'ah, and each athan's recording and volume (including recordings
  uploaded on the wall); Today shows the next prayer.

Changed
-------

- Prayer settings are the household's (`settings/prayer`), shared by the
  wall and the phones, written field by field; the wall's display schedule
  owns the backlight. Settings from the standalone Adhan Clock do not carry
  over: set the place again (from the wall or a phone), and upload any own
  recordings and photos again on the tablet.
- The tablet caches the prayer media (about 30 MB) for offline use; phones
  never download it.

0.2.3 (2026-11-05)
==================

Fixed
-----

- Events on Google's holiday calendars no longer wait in To assign: they
  are the whole family's unless someone assigns them otherwise.
- The phone's pairing screen does not offer the wall layout on a phone's
  screen.
- To assign on the phone says "Every time it repeats" for an assignment
  that covers a whole series.

0.2.2 (2026-11-05)
==================

Fixed
-----

- A phone once signed in with the household's Google account opened as a
  second wall. A screen under 480 CSS px on its short side is now a phone
  unless a layout was chosen on it; only a choice made on the device is
  stored, and a device under Fully Kiosk opens as the wall.
- The phone's loading screen no longer offers the wall layout; the link
  shows with the pairing form only.

0.2.1 (2026-11-05)
==================

Added
-----

- Phone: More > People adds, edits, reorders and deletes the family's
  people, with the wall's rules (unique names, a delete that says what it
  archives). Today, Tasks and Stars with no people offer Add a person.

Changed
-------

- Saving a profile writes only the fields changed in the editor, so a
  change another device made to the others meanwhile is kept.
- A profile name already taken says "Someone else is already called ...";
  a name left as the editor opened it is never refused, so another device
  renaming someone meanwhile does not block saving the other fields.

Fixed
-----

- An Arabic name in the profile delete confirmation and its messages
  keeps its punctuation on its own side.
- On the phone, the task editor and Who did it? say people are added in
  More > People, not in the wall's Settings.

0.2.0 (2026-11-05)
==================

Phone companion for parents, on the same address as the wall.

Added
-----

- Pairing: the wall shows a ten-minute, one-use code (QR or typed) under
  Settings > Phones, behind the PIN each time; the phone gets its own
  sign-in and never asks for the PIN. The wall lists and removes phones; a
  phone can unpair itself.
- Phone tabs: Today (next up, each person's progress, tonight's dinner,
  countdowns, the wall's note and timer), Tasks (check off, skip, Up for
  Grabs, add and edit), Lists, Calendar (agenda, event details, add and
  edit, To assign) and More (stars and rewards, the wall timer, a note to
  the wall, Sleep now and Wake up for the wall, meals, this phone).
- Settings > About on a phone-sized or paired device: use the phone layout.

Changed
-------

- The wall's timer lives in Firestore so a phone can start, watch and stop
  it; a run started on a wall shows only on that wall, one from a phone on
  every wall. A new run ends Sleep now.
- Firestore rules refuse a check-off, uncheck, ledger change or redemption
  made from a stale copy (a device that was offline), so stars are not
  given or spent twice.
- A grocery item added again writes only what changes, and is written back
  whole when it was cleared on another device meanwhile.
- A note on the wall no longer holds off an update, and a reload does not
  announce it again.
- CI retries a failed e2e test once and never cancels a deploy in progress.

Fixed
-----

- Opening Lists or Home with a PIN set raised the keyboard and the PIN pad.
- Two devices adding the same grocery item at once made two items.

0.1.0
=====

The wall: Home, Calendar (Google calendars, assignments, countdowns, To
assign), Lists, Tasks, Rewards, Meals, Recipes, Sleep and Settings, with the
parental PIN, the night and sleep windows, and offline use.
