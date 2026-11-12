// Start-up: every screen module wires itself up when imported; this loads the data and opens
// the feed where the reader left off.

import './ui/app-state.js';
import './ui/dom.js';
import './ui/pressable.js';
import './ui/cards.js';
import './ui/feed.js';
import './ui/rail.js';
import './ui/history.js';
import './ui/actions.js';
import './ui/sheets.js';
import './ui/reflect-sheet.js';
import './ui/study.js';
import './ui/jump.js';
import './ui/tabs.js';
import './ui/reflections.js';
import './ui/liked.js';
import './ui/backup.js';
import './ui/update.js';
import { Bible } from './core/bible.js';
import { Journal } from './data/journal.js';
import { prefs } from './data/prefs.js';
import { lang } from './lang/current.js';
import { setData } from './ui/app-state.js';
import { el } from './ui/dom.js';
import { updateBackupReminder } from './ui/backup.js';
import { openAt } from './ui/feed.js';

/** Covers the app with `message`: what went wrong and what to do. Nothing behind it can be used. */
function stopWith(message) {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  const note = document.getElementById('loading') ?? document.body.appendChild(el('p', { id: 'loading' }));
  note.className = 'loading stopped';
  note.textContent = message;
}

const failure = (what, next) => (error) => {
  throw new Error(`Couldn't ${what} (${error?.message ?? error}). ${next}`);
};

const at = {}; // TEMP-TIMING
const mark = (name) => (value) => { at[name] = performance.now(); return value; }; // TEMP-TIMING
mark('scripts')(); // TEMP-TIMING

async function start() {
  // Reading waits for the journal too: without it, reflections written now would be lost.
  const [data, opened] = await Promise.all([
    fetch(lang.bibleFile).then(mark('bibleFile')).then((r) => r.json()).then(mark('bible'))
      .catch(failure('load the Bible text', 'Check the connection, then open Bible Scroll again.')),
    Journal.open(lang.database).then(mark('journal'))
      .catch(failure('open your reflections', 'Close Bible Scroll completely, then open it again.')),
  ]);
  opened.addEventListener('closed', () => {
    stopWith('Bible Scroll was updated in another tab. Close this one and carry on there.');
  });
  setData(new Bible(data), opened);
  mark('setup')(); // TEMP-TIMING
  openAt(prefs.lastVerse.get());
  document.getElementById('loading').remove();
  updateBackupReminder();
  let timed = false; // TEMP-TIMING
  const timeShown = () => { if (!timed) { timed = true; mark('shown')(); showTiming(); } }; // TEMP-TIMING
  requestAnimationFrame(() => setTimeout(timeShown)); // TEMP-TIMING
  setTimeout(timeShown, 1000); // TEMP-TIMING

  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.();
}

function showTiming() { // TEMP-TIMING
  const nav = performance.getEntriesByType('navigation')[0] ?? {}; // TEMP-TIMING
  const s = (ms) => `${(ms / 1000).toFixed(2)} s`; // TEMP-TIMING
  const lines = [ // TEMP-TIMING
    `Last start: ${new Date(performance.timeOrigin).toLocaleTimeString()}, ready in ${s(at.shown)}${document.hidden ? ' (in the background)' : ''}`, // TEMP-TIMING
    `Page from the offline copy: ${s(nav.responseEnd ?? 0)} (worker ${nav.workerStart ? s(nav.workerStart) : 'none'})`, // TEMP-TIMING
    `App code: ${s(at.scripts - (nav.responseEnd ?? 0))}`, // TEMP-TIMING
    `Bible: ${s(at.bibleFile - at.scripts)} to open, ${s(at.bible - at.bibleFile)} to read`, // TEMP-TIMING
    `Reflections: ${s(at.journal - at.scripts)}`, // TEMP-TIMING
    `Setting up: ${s(at.setup - Math.max(at.bible, at.journal))}, drawing: ${s(at.shown - at.setup)}`, // TEMP-TIMING
  ]; // TEMP-TIMING
  document.getElementById('startupTiming').textContent = lines.join('\n'); // TEMP-TIMING
} // TEMP-TIMING

// Registered before start() so a broken version can still be replaced by the next one.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

start().catch((error) => stopWith(error?.message ?? String(error)));
