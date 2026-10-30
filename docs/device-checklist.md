# Device checklist

Run on the simulator (or a phone) after any change that touches touch handling, sheets, the feed, or saved data. Automated tests (`tests/run.sh`) cover the journal; this covers what only a real touch screen shows.

Every button and link should pass the **press test**:

- **Tap:** it darkens while held (icons and text dim), the action happens. No blue ring.
- **Press, slide a little, release:** the action happens.
- **Press, slide well away, release:** the shade clears once the finger is about a finger's width past the edge; nothing happens.
- **Press, slide well away and back, release:** the shade comes back; the action happens.
- **Long press until iOS takes over (magnifier or callout), then release:** nothing happens.
- **Flick the list or page starting on the button:** it scrolls, nothing is pressed.
- **Two fingers (slide one off, tap with the other, lift both):** nothing unintended happens.

## Feed

- [ ] Swipe up and down one verse at a time; it settles on each verse.
- [ ] End of a chapter: the chapter-end page appears and auto-advances to the next chapter.
- [ ] Tap Jump or History just as the auto-advance starts: the feed stays on the chapter-end page, and History does not list the next chapter.
- [ ] Start of Genesis and end of Revelation: no crash, sensible boundary pages.
- [ ] Verse rail: drag to scrub, release lands on that verse.
- [ ] Relaunch: opens at the last verse read.
- [ ] Press test on the Bible, Reflections and Liked tabs, the Jump and History pills, the person button, sheet Done and Cancel buttons, the testament switch, the Reflections and Liked cards, and each reflection's ••• button and its Edit, Share and Delete menu.

## Verse actions (like, reflect, share, study)

- [ ] Press test on each of the four buttons.
- [ ] Like: heart fills red with the pop; tap again to unlike; the Liked tab updates.
- [ ] Reflect: sheet opens on the right verse; the count badge updates after saving.
- [ ] Share: share sheet with the verse text and reference.
- [ ] Study: opens Bible Hub on the right verse; each link opens once.

## History menu

- [ ] Press test on the history items.
- [ ] Tap an item: goes there; the menu closes.
- [ ] The place being read is listed as "Now"; tapping it only closes the menu, and its pin works like any other.
- [ ] Pin: tap the pin on the left; it fills in and the place moves to the top. Up to three; with three pinned the other pins fade and tapping one says "Unpin one to pin this". Pins stay through more jumps and through Clear History.
- [ ] Open a pinned place from History: a pin appears in the chapter pill, before the name. Scroll into the next or previous chapter: the pin stays, and History shows that pin as "Now" at the new place, with no other new row. Jump elsewhere (Jump sheet, a card, an unpinned row): the pin goes, and the track waits at the last verse read on it. Pinning "Now" also shows the pin.
- [ ] Jump from History while the feed is still gliding: it stays at the new place.

## Jump sheet

- [ ] Press test on the reading button, the book list and the chapter grid.
- [ ] Search: `gen` lists Genesis; `gen 1` goes to 1:1; `gen 1:` goes to 1:1; `gen 1:12` goes to 1:12; `1 john 3` works.
- [ ] Flick the book list and lift: nothing is pressed.

## Reflections

- [ ] Write a reflection, tap Done: saved, shown in the timeline and the Reflections tab.
- [ ] Each reflection shows •••: it opens Edit, Share and Delete under it, one menu at a time; a tap elsewhere or a scroll closes it; Delete asks first.
- [ ] Edit: Cancel and Save replace Done, and the label says which day's reflection it is; change the text, tap Save: saved, marked Edited, Done comes back.
- [ ] Edit, change the text, tap Cancel: asks "Discard changes?"; yes keeps the original. Cancel with no changes asks nothing.
- [ ] Edit, change the text, swipe home, reopen, tap Cancel: the original comes back.
- [ ] Edit one, then tap Edit on another: the first edit is kept.
- [ ] Edit one, delete it from its row: the edit ends and it stays deleted.
- [ ] Start writing, swipe home, reopen: the text is still there and saved.
- [ ] Reflections tab: the date filters work; press test on the filter pills and the backup banner.
- [ ] Search (magnifier): the keyboard opens; typing lists, newest first, every reflection whose own words match, from any period; dragging the list or Return puts the keyboard away; the keyboard doesn't hide the results; Cancel brings back the title and filter.
- [ ] Share several (share icon in the header, beside Cancel in search, or a long press on a card): circles show on the left and the tabs become a ✕ and a Share pill; ticking cards counts them ("Share 2") and turns Share on; the search box and period are locked; Share sends them oldest first, each with its verse and date; ✕ clears the ticks and brings back the tabs.

## Liked

- [ ] Liked verses grouped by day, newest first; tapping one goes to it.

## Backup and restore (person button)

- [ ] Stats show the right counts of reflections and liked verses.
- [ ] Back Up on a phone that has never backed up: the "hasn't made a backup before" warning appears.
- [ ] Back Up: share sheet; save to Files; the toast and "Last backup" time update; the red dot clears.
- [ ] Delete a reflection, Back Up: the "your last one had" warning appears.
- [ ] Restore that file: the deleted one comes back; the toast says what was restored; the Reflections and Liked tabs both show it.
- [ ] Restore the same file again: "Everything in this backup is already here".
- [ ] Restore a non-backup file: a clear error, nothing changes.

## Updates

- [ ] After a version bump, close and reopen twice: the new version is running (no mix of old and new files).

## Both languages

- [ ] English (site root) and Malayalam (`/ml/`) each open with their own text, and each keeps its own reflections, likes, History and Reflections filter.
- [ ] A like or reflection in one app does not appear in the other.
- [ ] A backup from the old separate Malayalam app restores into the Malayalam app.
