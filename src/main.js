// Start-up: every screen module wires itself up when imported; this loads the data and opens
// the feed where the reader left off.

import './ui/app-state.js';
import './ui/dom.js';
import './ui/haptics.js';
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
import { setData } from './ui/app-state.js';
import { updateBackupReminder } from './ui/backup.js';
import { openAt } from './ui/feed.js';

async function start() {
  const [data, opened] = await Promise.all([
    fetch('bsb.json').then((r) => r.json()),
    Journal.open(),
  ]);
  setData(new Bible(data), opened);
  openAt(prefs.lastVerse.get());
  document.getElementById('loading').remove();
  updateBackupReminder();

  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.();
}

// Registered before start() so a broken version can still be replaced by the next one.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

start().catch((error) => {
  document.getElementById('loading').textContent = `Couldn't load: ${error?.message ?? error}`;
});
