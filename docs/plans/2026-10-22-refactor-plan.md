# Refactor plan: from one big file to a maintainable, two-language app

Branch: `refactor/structure`. `main` is what GitHub Pages serves, so it stays untouched until a phase is verified; each verified phase is merged to `main` and pushed only when the owner says so.

Findings referenced as "review #N" are in `docs/review-2026-10-22.md`.

## Goals

- Behaviour stays the same unless a phase says otherwise. Every phase leaves the app working.
- One way to do each thing: one haptic guard, one way to refresh after a data change, one card builder.
- Each module owns its state; nothing reaches into another module's variables.
- English and Malayalam come from this one repo, so fixes land once.
- Still no framework and no build step for the app itself; plain ES modules.

## Constraint that shapes the layout

iOS gives each home-screen app its own storage, tied to its URL. Moving the English app away from the current root URL would make the existing home-screen icon a new, empty app. So:

- English stays at the site root (`/bible-scroll-pwa/`), unchanged URL, unchanged database name.
- Malayalam is added at `/bible-scroll-pwa/ml/` with its own manifest, service worker scope, cache name, database name and localStorage prefix.
- Malayalam readers move once: Back Up in the old Malayalam app, add the new icon, Restore. The old Malayalam site then shows a notice pointing to the new one.

## Process for every phase

1. Implement only that phase's files.
2. Run the test page (from phase 2 on) and the device checklist in the simulator.
3. Bump the cache version.
4. One commit, with a message in the repo's style. Stop for the owner's review.
5. Merge to `main` and push only on the owner's go-ahead.

## Phase 1: data-safety fixes

Review #1, #3, #4, #5. Small, targeted changes in the current `app.js`, before anything moves, so they can ship on their own.

- Files: `app.js`, `sw.js` (version).
- Verify in the simulator: fresh install with existing backup (warning and Restore offer appear); delete-while-editing; switch edits; background the app mid-draft and relaunch.

## Phase 2: safety net

- `tests.html` plus `tests/*.test.js`: a tiny test runner (about 40 lines, no dependencies), opened in headless Chrome by `tests/run.sh`, which prints pass/fail.
- Characterisation tests for the pure logic as it is today: verse keys, `parseReference` (including `gen 1:`), the chapter window, `readBackup` validation, and the restore merge. Journal tests run against a throwaway database name.
- `docs/device-checklist.md`: per surface (feed actions, History, Jump, Reflections controls, rail): tap, long press then slide off, flick, quick re-tap, two fingers; plus backup, restore and an update across versions.
- Files: `tests.html`, `tests/`, `docs/device-checklist.md`.
- Done (v130). Loading `app.js` starts the app, so its pure logic was moved out unchanged (owner's choice), an early slice of phase 4: `src/core/references.js`, `bible.js`, `feed-model.js` (now takes `bible`, the current window and items as arguments instead of reading globals) and `backup-file.js`. `Journal.open(name)` takes a database name for tests. Run `tests/run.sh`.

## Phase 3: standards

- `CODING_STANDARDS.md`: module layout and what goes where, state ownership, events, the haptic and pressable rule, naming, comment style, how to add a sheet or a tab, release steps. Future agent work follows it.
- `AGENTS.md`: one paragraph pointing to the standards, the checklist and the test command.

## Phase 4: split `app.js` into modules (pure moves)

No logic changes; functions move as they are. Proposed layout:

```text
index.html, style.css, manifest.webmanifest, sw.js
src/
  main.js            start-up: load data, wire modules together
  core/              no DOM (done in phase 2)
    references.js    packed verse keys, names, Bible Hub links, parseReference
    bible.js         Bible class over the text file
    feed-model.js    chapter window, boundary pages
    backup-file.js   reading and checking a backup file
  data/
    journal.js       IndexedDB (moved)
    prefs.js         every localStorage key in one place
  ui/
    dom.js           el(), templates
    haptics.js       tick(), withHaptic()
    sheets.js        shared dialog behaviour
    feed.js          verse pages, settling, auto-advance
    rail.js          verse rail scrubber
    history.js       history menu
    actions.js       like, reflect, share, study
    reflect-sheet.js reflection composer and timeline
    jump.js          Jump sheet and search
    tabs.js          tab switching
    reflections.js   Reflections tab
    liked.js         Liked tab
    backup.js        backup, restore, reminder
```

- Each module imports what it uses; module-scope constants move to the module that owns them (review #13).
- `sw.js` `ASSETS` list updated.
- Verify: all tests and the full device checklist; the diff should read as moves.
- Done (v133). Split by a script that works out each module's imports and exports, so no code was retyped. Not a pure move in four places: `bible` and `journal` are set through `setData()` (an import can't be assigned); `LAST_VERSE` moved to `app-state.js` and the card-tap handler became `openCard()` in `liked.js`, both because a module read them while loading before they were set; `DRAG_PX` moved to `haptics.js`. `prefs.js` waits for phase 6. Also added `study.js` and `app-state.js` (shared state, emptied in phase 6), and a start-up test that boots the app in a frame. Section banner comments were left as they were.

## Phase 5: shared building blocks

- `ui/pressable.js`: one slide-off guard for everything with a hidden haptic switch. It tracks one touch by identifier, disables that container's switches on a drag, scroll or `touchcancel`, swallows the following click, and re-enables when that touch is over. It replaces the four copies, with the Jump sheet's "touch stopped a scroll" rule as an option (review #2, #6, #12, the two-finger risk).
- Journal emits a `change` event after every write; one subscriber refreshes counts, hearts, the backup state and the visible tab. This replaces the seven manual refreshes (review #9).
- `Bible#text(key)`, one `verseCard()`, one `groupByDay()`, shared date helpers (review #13).
- Verify: tests, plus the checklist's touch section on every surface.
- Done (v136). `guardPresses(container, { group, scrollers })` registers each surface; the "touch stopped a scroll" rule applies to every container that scrolls. Switches are derived by `syncSwitches()` from the button's `disabled` and `.dragged`, which also does phase 6's switch rule early (review #8). Instead of one subscriber, each module subscribes to `onJournalChange()` for what it owns (feed pages, backup state), and tabs register their render with `registerTab()`, which also re-renders the visible tab; this removed the import cycle between `tabs.js` and the tabs it shows. `groupByDay()` became `appendByDay()` in `ui/cards.js`, because Reflections loads a page at a time; date helpers are in `core/dates.js`. Tests: the guard (touch events), journal change events, dates and `Bible#text`, and an app test that an open Liked or Reflections tab follows the journal. Checked in the simulator: like, write a reflection, both tabs.

## Phase 6: state ownership

- Each switch's `disabled` state comes from one rule: `button.disabled || inside .dragged` (review #8).
- `prefs.js` gives every stored key a prefix, so a second language can share the origin without collisions. The English prefix is empty, so existing data is read as before.
- `tab`, filters and timers live in their module's state, not in globals read across modules.
- Done (v141). The switch rule was done in phase 5. `src/data/prefs.js` holds every stored setting (`preferences(prefix, storage)`; English uses `''`, phase 7 picks the Malayalam prefix). The feed owns its window, pages and timers, and exports what others need (`currentVerse()`, `readingPlace()`, `itemFor()`, `chapterPageIDs()`, `scrollToPage()`, `stopAdvance()`, `openAt()`). The same rule was applied where it turned up: the rail's state (`isScrubbing()`), the verse-action table (`onVerseAction()`) and `tab` (`currentTab()`). `app-state.js` now holds only what start-up sets once. Tests: preferences (old keys still read, prefixes stay apart) and an app test that opens the Jump sheet. Checked in the simulator: reopening at the saved verse, Jump, Like, Reflect, Study, scrolling saves the place, auto-advance past a chapter end, the Reflections filter.

## Phase 7: language as configuration

- `src/lang/en.js` and `src/lang/ml.js`: Bible file, book names and abbreviations, UI strings, Bible Hub link format, database name, storage prefix, cache name, manifest name and icon.
- Catalogue the Malayalam fork's differences (about 60 lines of `app.js`, plus `build.py`) and move each into the language config.
- `ml/index.html`, `ml/manifest.webmanifest` and `ml/sw.js` load the shared `src/` with the Malayalam config.
- `build.py` builds both text files and both icon sets.
- Verify: both apps installed side by side in the simulator, each with its own reflections and likes; a Malayalam backup from the old fork restores into the new app.
- Then retire the fork: the old Malayalam site shows a "moved" notice.
- Done (v143), except retiring the fork, which waits until this is published. The fork differed by about 20 lines: storage names (`ml.` prefix, `bible-scroll-ml` database and caches), the share and backup names, the attribution and the text file; book names, styles and icons were the same. Those are `src/lang/en.js` and `ml.js`, picked by `data-bible` on the page's `<html>`. `pages.py` writes `ml/index.html`, `ml/manifest.webmanifest` and `ml/sw.js` from the English files (paths to `../`, three values in `sw.js`); `tests/run.sh` fails if they are out of date. `sw.js` now has `APP`, `BIBLE`, `SHARED` and `VERSION` at the top. The Malayalam storage names are the fork's own, so a Safari tab on the old site and the new one see the same data; home-screen apps are kept apart by iOS anyway. Same name and icon as English (owner's choice). `build.py` builds `ml/mal1910.json` too, byte for byte the fork's file. Tests: the Malayalam app boots with its own text and keeps its likes and settings apart, every file each worker caches exists, and a backup in the fork's format reads. Checked in the simulator: both apps in Safari, each with its own text, database, worker and cache.

## Phase 8: release mechanics

- `release.py` (or a `build.py` step) bumps one version for both apps and regenerates the `ASSETS` lists, so feature commits no longer edit `sw.js` (review #10).
- Fix `sw.js` storing a newer file into an older cache on a miss.
- Done (v148). `pages.py` became `release.py`: it rebuilds the shared file list in `sw.js` from `src/`, `icons/`, `style.css` and `books.js`, bumps `VERSION`, and writes the `ml/` copies; `--check` (run by `tests/run.sh`) fails when a file is missing from the list or a copy is stale. A cache miss now goes to the network without being stored. Checked in the simulator: two releases in a row; each app picks up the new code within a few launches and deletes only its own older caches.

## Phase 9: remaining backlog

The rest of the review: #7 (glide timer), #11 (edited reflections and the reminder), the lower-confidence risks (backup status, storage persistence and the Safari-tab warning, IndexedDB `onblocked`, `shareBackup` in-flight guard, a failed `prepareBackup`, start-up without IndexedDB, History menu as a sheet).

## Deferred

- Splitting `style.css` per module.
- A language switch inside one app (not needed with two installs).
