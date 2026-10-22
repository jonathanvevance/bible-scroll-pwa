import { daysAgo } from '../core/dates.js';
import { unpackKey, verseName } from '../core/references.js';
import { prefs } from '../data/prefs.js';
import { el } from './dom.js';
import { jumpTo } from './feed.js';
import { withHaptic } from './haptics.js';
import { guardPresses } from './pressable.js';

// ---------- History ----------
// Every jump (the chapter picker, a reference, a reflection card, a history entry) records the
// place being left: newest first, one entry per chapter, five at most. The History pill lists
// them, and shows whenever there is somewhere other than this chapter to go back to.

const HISTORY_SIZE = 5;
const historyButton = document.getElementById('historyButton');
const historyMenu = document.getElementById('historyMenu');
const historyList = document.getElementById('historyList');
const chapterOf = (key) => Math.floor(key / 1_000) * 1_000;

/** Every entry outside the chapter being read. */
function historyPlaces() {
  const here = chapterOf(prefs.lastVerse.get());
  return prefs.history.get().filter((h) => unpackKey(h.key) && chapterOf(h.key) !== here).slice(0, HISTORY_SIZE);
}

export function updateHistory() { historyButton.hidden = !historyPlaces().length; }

/** Call before jumping, while `prefs.lastVerse` still holds the verse being read. */
export function rememberPlace() {
  const key = prefs.lastVerse.get();
  if (!unpackKey(key)) return;
  const rest = prefs.history.get().filter((h) => chapterOf(h.key) !== chapterOf(key));
  prefs.history.set([{ key, time: Date.now() }, ...rest].slice(0, HISTORY_SIZE));
}

/** "Now", "5 min", "2 h", "Yesterday", "Mon", or "3 Oct". */
function ago(time) {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  const days = daysAgo(time);
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes} min`;
  if (days === 0) return `${Math.floor(minutes / 60)} h`;
  if (days === 1) return 'Yesterday';
  const style = days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(undefined, style).format(time);
}

function openHistory() {
  historyList.replaceChildren(...historyPlaces().map((h) => {
    const button = el('button', {}, verseName(unpackKey(h.key)), el('time', {}, ago(h.time)));
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', () => { closeHistory(); jumpTo(h.key); });
    return el('li', {}, withHaptic(button));
  }));
  historyMenu.hidden = false;
}

function closeHistory() { historyMenu.hidden = true; }

historyButton.addEventListener('click', () => { if (historyMenu.hidden) openHistory(); else closeHistory(); });
historyMenu.addEventListener('click', (e) => { if (e.target === historyMenu) closeHistory(); });

// As in iOS menus, a touch that slides away from where it began picks nothing.
guardPresses(historyMenu);
document.getElementById('clearHistory').addEventListener('click', () => {
  prefs.history.clear();
  updateHistory();
  closeHistory();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHistory(); });
updateHistory();
