# Coding standards

How code in Bible Scroll is written. Follow these for every change; when a rule doesn't fit, change this file in the same commit rather than quietly working around it.

## What this app is

A home-screen web app for reading the Bible on iPhone, one verse per page. It is a lifelong family app: losing someone's reflections or likes is the worst possible bug, and a confusing screen is the second worst.

- Plain ES modules, no framework, no build step for the app. `build.py` only generates data (`books.js`, `bsb.json`, icons).
- iOS Safari in standalone mode is the target. Anything else is a bonus.
- One codebase serves every language (English at the site root, Malayalam at `/ml/`, from refactor phase 7).

## Layout

```text
index.html, style.css, manifest.webmanifest, sw.js   the page, its styles, offline cache
app.js                     start-up; shrinks to src/main.js in refactor phase 4
journal.js                 IndexedDB: reflections and marks (moves to src/data/)
src/core/                  pure logic, no DOM, no storage: references, Bible text, feed model, backup reading
src/data/                  storage: the journal, preferences (localStorage)
src/ui/                    one module per screen or shared behaviour
tests/, tests.html         automated tests (tests/run.sh)
docs/                      review findings, plans, the device checklist
```

- `src/core/` never touches `document`, `window`, `localStorage` or IndexedDB, so it can be tested on its own. Its functions take what they need as arguments (the Bible, the current window) instead of reading app state.
- A module that only makes sense for one screen lives with that screen. Something used by two screens moves to a shared module; three copies of anything is a bug.

## State

- Each piece of state has exactly one owner module, which is the only code that writes it. Others read it through a function the owner exports, or react to the owner's events.
- No module reads another module's variables directly, and no module-level `let` is written from outside its module.
- Stored keys (localStorage) are declared once, in the preferences module, with the language prefix. Never write `localStorage.getItem('…')` with a literal elsewhere.
- The DOM shows state; it is not where state lives. Exception: a CSS class used purely for styling (`.dragged`, `.closing`).
- A value derived from several reasons (for example, whether a haptic switch is enabled: the button is disabled, or a drag is in progress) is computed by one function from all the reasons, never set separately by each.

## Saved data

- All reflections and marks go through the `Journal` API; nothing else opens IndexedDB.
- After any write, the journal emits a change event; screens refresh from that event, not from hand-written refresh calls at each write site (from refactor phase 5).
- Never overwrite or delete the person's data as a side effect. Restoring merges; a backup that may hold less than the file it replaces asks first.
- Changing the database shape needs a new `indexedDB.open` version with an upgrade step, and a test that upgrades a database of the previous version without losing anything.
- Changing the backup file: new fields are optional, so older versions of the app ignore them; anything an older version can't safely ignore needs a new `BACKUP_FORMAT` and a test.

## Touch and haptics

- iOS gives script no haptic API. Every tappable control carries a hidden `<input type="checkbox" switch class="haptic">`: in HTML, or added with `withHaptic()` for buttons made in script.
- A native switch toggles on release even after the finger has slid away, so every control with a haptic must pass the press test in `docs/device-checklist.md`: a press that slides off, is cancelled by iOS (long press), or turns into a scroll does nothing and plays no tick.
- That behaviour comes from one shared guard (refactor phase 5). Never write touch tracking for a new control; register its container with the guard.
- Hit targets are at least 44×44 points.

## Sheets

- Every sheet is a `<dialog class="sheet">` in `index.html`, opened with `showModal()` and closed with `closeSheet()`, so it gets the shared close animation, tap-outside and scroll behaviour.
- Anything that floats over the feed and should pause auto-advance is a `<dialog>` (the History menu is the current exception; see below).

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
- Temporary test code in the app is marked with `// TEMP-TEST` on every line and removed before committing (`rg TEMP app.js sw.js` prints nothing).

## Releasing

- Any change to a file the app loads bumps the version in `sw.js` (one script does this from refactor phase 8). A new version takes over on the second launch after it is published.
- Every file the app loads is listed in `sw.js` `ASSETS`; a missing file breaks offline use, a wrong path breaks the update.
- Work happens on a branch; `main` is what GitHub Pages publishes. Commit messages describe the change from the reader's side ("Search: \"gen 1:\" goes to the chapter's first verse"), one change per commit.

## Current exceptions

The refactor plan (`docs/plans/2026-10-22-refactor-plan.md`) removes these; until then, don't add more of them.

- `app.js` is still one large file with sections; module-level state is shared across them (phase 4).
- The slide-off guard is written four times (History, verse actions, Jump sheet, Reflections controls); screens refresh by hand after journal writes (phase 5).
- Several sections set `.haptic.disabled`; localStorage keys are declared in the sections that use them (phase 6).
- The History menu is a `<div>`, not a `<dialog>` (phase 9).
