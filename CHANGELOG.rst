=========
Changelog
=========

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
