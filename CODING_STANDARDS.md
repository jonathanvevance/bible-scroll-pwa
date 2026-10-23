# Coding standards

How code in Bible Scroll is written. Follow these for every change; when a rule doesn't fit, change this file in the same commit rather than quietly working around it.

## What this app is

A home-screen web app for reading the Bible on iPhone, one verse per page. It is a lifelong family app: losing someone's reflections or likes is the worst possible bug, and a confusing screen is the second worst.

- Plain ES modules, no framework, no build step for the app. `build.py` only generates data (`books.js`, `bsb.json`, `ml/mal1910.json`, icons); `release.py` prepares each new version.
- iOS Safari in standalone mode is the target. Anything else is a bonus.
- One codebase serves every language: English at the site root, Malayalam at `/ml/`. iOS keeps each home-screen app's storage apart by URL, so English never moves from the root.

## Layout

```text
index.html, style.css, manifest.webmanifest, sw.js   the page, its styles, offline cache
ml/                        the Malayalam app: its text, and copies of the three files above (from release.py)
src/lang/                  what each language has of its own: text file, names, storage names
src/main.js                start-up: loads the data, opens the feed
src/core/                  pure logic, no DOM, no storage: references, Bible text, feed model, dates, backup reading
src/data/                  storage: the journal (IndexedDB) and preferences (localStorage, `prefs.js`)
src/ui/                    one module per screen or shared behaviour
tests/, tests.html         automated tests (tests/run.sh)
docs/                      review findings, plans, the device checklist
```

- `src/core/` never touches `document`, `window`, `localStorage` or IndexedDB, so it can be tested on its own. Its functions take what they need as arguments (the Bible, the current window) instead of reading app state.
- Modules import each other in cycles (feed and history, for example), so code that runs while a module loads must not read another module's `const` or `let`: it may not be set yet, and the app fails to start (the start-up test catches this). Calling another module's `function` is fine, as is anything inside event handlers.
- A module that only makes sense for one screen lives with that screen. Something used by two screens moves to a shared module; three copies of anything is a bug.

## State

- Each piece of state has exactly one owner module, which is the only code that writes it. Others read it through a function the owner exports (`currentTab()`, `currentVerse()`, `isScrubbing()`), ask the owner to act (`stopAdvance()`), register with it (`onVerseAction()`, `registerTab()`), or react to its events (`onJournalChange()`).
- `src/ui/app-state.js` holds only what start-up sets once and every screen shares: the Bible, the journal, the feed element. Nothing there changes afterwards.
- No module reads another module's variables directly, and no module-level `let` is written from outside its module.
- Stored settings are declared once, in `src/data/prefs.js`, and read and written through `prefs` (`prefs.lastVerse.get()`). Nothing else touches `localStorage`. A new setting needs a new entry there; renaming a stored key loses what people have saved under it.
- The DOM shows state; it is not where state lives. Exception: a CSS class used purely for styling (`.dragged`, `.closing`).
- A value derived from several reasons (for example, whether a haptic switch is enabled: the button is disabled, or a drag is in progress) is computed by one function from all the reasons, never set separately by each.

## Saved data

- All reflections and marks go through the `Journal` API; nothing else opens IndexedDB.
- After any write, the journal emits a change event; screens refresh from that event, not from hand-written refresh calls at each write site. A module subscribes with `onJournalChange()` for what it owns; a tab registers its render with `registerTab()`, which runs it when the tab is shown and when the journal changes while it is visible.
- Never overwrite or delete the person's data as a side effect. Restoring merges; a backup that may hold less than the file it replaces asks first.
- Changing the database shape needs a new `indexedDB.open` version with an upgrade step, and a test that upgrades a database of the previous version without losing anything.
- Changing the backup file: new fields are optional, so older versions of the app ignore them; anything an older version can't safely ignore needs a new `BACKUP_FORMAT` and a test.

## Touch and haptics

- iOS gives script no haptic API. Every button carries a hidden `<input type="checkbox" switch class="haptic">`, added by `src/ui/haptics.js` to every button on the page, including ones built later. Don't write the switch by hand. Links get none: a switch inside a link takes the tap, so the link might not open. The rail is a div and has its own switch in `index.html`.
- Every `:active` rule ends in `:not(.dragged, .dragged *)`, so a control stops looking pressed as soon as the finger slides off. A test checks this.
- A native switch toggles on release even after the finger has slid away, so every control with a haptic must pass the press test in `docs/device-checklist.md`: a press that slides off, is cancelled by iOS (long press), or turns into a scroll does nothing and plays no tick.
- That behaviour comes from one shared guard in `src/ui/pressable.js`, which covers every `button` and `a[href]` on the page with nothing to register; a scroll of anything the control sits in counts as a drag. Never write touch tracking for a new control. Use `guardPresses(root, { group })` only when a whole area should react to a slide-off together (the verse actions, the History menu). The rail is a slider and is never guarded. Code that disables a button with a haptic calls `syncSwitches()` afterwards.
- Hit targets are at least 44×44 points.

## Sheets

- Every sheet is a `<dialog class="sheet">` in `index.html`, opened with `openSheet()` and closed with `closeSheet()`, so it gets the shared close animation, tap-outside and scroll behaviour. Never call `showModal()` directly; a test checks this.
- Anything that covers the feed calls `pauseFeed()` as it opens: no move to the next chapter starts, and a glide under way goes back to the page it left. `openSheet()` does it for sheets. The History menu is a `<div>` because it opens under the top bar, so the History pill can close it; opening it calls `pauseFeed()`, and so does leaving the Bible tab.

## Style

- JavaScript: 2-space indent, single quotes, semicolons, `const` by default, arrow functions for small helpers, `function` declarations for anything with a body worth naming. Lines up to about 110 characters.
- Names say what something is in the reader's terms: `verseName`, `shareBackup`, `reflectionTotal`. Constants for stored keys and timings are `UPPER_SNAKE`.
- Build DOM with `el(tag, props, ...children)`; repeated structures come from a `<template>` in `index.html`.
- CSS: colours, spacing that recurs and timing curves are custom properties in `:root`, with dark-mode values in the `prefers-color-scheme` block. Match iOS system metrics and colours.
- User-facing text: plain, short, warm; say what happened and what to do next ("Tap Back Up again to finish.").

## Comments

- A `/** … */` line above a function or constant says what it is or what it promises, when the name alone doesn't.
- A `//` comment explains a constraint the code can't show: an iOS quirk, why an order matters, why something is not awaited.
- No comments that narrate the next line, record history ("fixed …", "used to …") or address a reviewer. History belongs in commit messages.

## Testing

- `tests/run.sh` must pass before every commit. It runs `tests.html` in headless Chrome (about 2 seconds) and exits non-zero on failure.
- New or changed logic in `src/core/` or the journal comes with a test in `tests/`. Tests use their own database name and never touch the app's data.
- Changes to touch handling, sheets, the feed or saved data are checked against the relevant sections of `docs/device-checklist.md` in the simulator.
- Temporary test code in the app is marked with `// TEMP-TEST` on every line and removed before committing (`rg TEMP src sw.js ml` prints nothing).

## Releasing

- After changing any file the app loads, run `python3 release.py`: it lists every shared file in `sw.js`, bumps `VERSION` (one number for both apps) and rewrites the `ml/` copies. A new version takes over on the second launch after it is published. Never edit the file list or `VERSION` by hand.
- The service worker caches only what `ASSETS` lists, at install; anything else always comes from the network. A file the app loads must live in `src/` or `icons/` (listed automatically) or in the per-app list at the top of `ASSETS`, or offline use breaks.
- Never edit `ml/index.html`, `ml/sw.js` or `ml/manifest.webmanifest`: edit the English file and run `python3 release.py` (`tests/run.sh` fails while they are out of date). Anything that differs by language goes in `src/lang/`, not in an `if`.
- Storage names in `src/lang/` (`database`, `storagePrefix`, `cacheName`) never change: people's reflections are stored under them.
- Work happens on a branch; `main` is what GitHub Pages publishes. Commit messages describe the change from the reader's side ("Search: \"gen 1:\" goes to the chapter's first verse"), one change per commit.

## Current exceptions

The refactor plan (`docs/plans/2026-10-22-refactor-plan.md`) removes these; until then, don't add more of them.

- None.
