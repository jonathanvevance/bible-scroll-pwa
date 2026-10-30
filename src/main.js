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

async function start() {
  // Reading waits for the journal too: without it, reflections written now would be lost.
  const [data, opened] = await Promise.all([
    fetch(lang.bibleFile).then((r) => r.json())
      .catch(failure('load the Bible text', 'Check the connection, then open Bible Scroll again.')),
    Journal.open(lang.database)
      .catch(failure('open your reflections', 'Close Bible Scroll completely, then open it again.')),
  ]);
  opened.addEventListener('closed', () => {
    stopWith('Bible Scroll was updated in another tab. Close this one and carry on there.');
  });
  setData(new Bible(data), opened);
  openAt(prefs.lastVerse.get());
  document.getElementById('loading').remove();
  updateBackupReminder();

  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.();
}

// Registered before start() so a broken version can still be replaced by the next one.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

start().catch((error) => stopWith(error?.message ?? String(error)));

if (new URLSearchParams(location.search).has('debug')) import('./ui/touch-debug.js');
