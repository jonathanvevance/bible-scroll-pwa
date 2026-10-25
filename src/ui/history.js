import { daysAgo } from '../core/dates.js';
import {
  MAX_PINS, chapterOf, isPinned, ordered, pinCount, remember, togglePin, withoutUnpinned,
} from '../core/history-list.js';
import { unpackKey, verseName } from '../core/references.js';
import { prefs } from '../data/prefs.js';
import { reduceMotion } from './app-state.js';
import { el, toast } from './dom.js';
import { jumpTo, pauseFeed } from './feed.js';
import { guardPresses } from './pressable.js';

// ---------- History ----------
// Every jump (the chapter picker, a reference, a reflection card, a history entry) records the
// place being left, one entry per chapter (rules in core/history-list.js). The History pill
// lists them, pins first, and shows whenever there is somewhere other than this chapter to go.

const historyButton = document.getElementById('historyButton');
const historyMenu = document.getElementById('historyMenu');
const historyList = document.getElementById('historyList');

/** Every entry outside the chapter being read, in the order the menu shows them. */
function historyPlaces() {
  const here = chapterOf(prefs.lastVerse.get());
  return ordered(prefs.history.get()).filter((h) => unpackKey(h.key) && chapterOf(h.key) !== here);
}

export function updateHistory() { historyButton.hidden = !historyPlaces().length; }

/** Call before jumping, while `prefs.lastVerse` still holds the verse being read. */
export function rememberPlace() {
  const key = prefs.lastVerse.get();
  if (!unpackKey(key)) return;
  prefs.history.set(remember(prefs.history.get(), key, Date.now()));
}

const PIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5"/>'
  + '<path d="M5 17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2Z"/></svg>';

function pinButton(h, pinsFull) {
  const pin = isPinned(h);
  const button = el('button', { className: 'history-pin', innerHTML: PIN_ICON, ariaLabel: pin ? 'Unpin' : 'Pin' });
  button.setAttribute('aria-pressed', String(pin));
  if (!pin && pinsFull) button.classList.add('full');
  button.addEventListener('click', () => {
    const next = togglePin(prefs.history.get(), h.key, Date.now());
    if (!next) return toast('Unpin one to pin this');
    prefs.history.set(next);
    renderHistory();
  });
  return button;
}

function renderHistory() {
  const pinsFull = pinCount(prefs.history.get()) >= MAX_PINS;
  historyList.replaceChildren(...historyPlaces().map((h) => {
    const place = el('button', { className: 'history-place' },
      el('span', { className: 'history-name', textContent: verseName(unpackKey(h.key)) }),
      el('time', {}, ago(h.time)));
    place.setAttribute('role', 'menuitem');
    place.addEventListener('click', () => { closeHistory(); jumpTo(h.key); });
    return el('li', {}, pinButton(h, pinsFull), place);
  }));
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

/** Not a sheet: it opens under the top bar, so the History pill can close it again. */
function openHistory() {
  clearTimeout(closeTimer);
  historyMenu.classList.remove('closing');
  pauseFeed();
  renderHistory();
  historyMenu.hidden = false;
}

const HISTORY_CLOSE_MS = 200;
let closeTimer;

/** Shrinks back into the pill, the way it came out, then hides. */
function closeHistory() {
  if (historyMenu.hidden || historyMenu.classList.contains('closing')) return;
  if (reduceMotion.matches) { historyMenu.hidden = true; return; }
  historyMenu.classList.add('closing');
  closeTimer = setTimeout(() => {
    historyMenu.classList.remove('closing');
    historyMenu.hidden = true;
  }, HISTORY_CLOSE_MS);
}

historyButton.addEventListener('click', () => {
  if (historyMenu.hidden || historyMenu.classList.contains('closing')) openHistory();
  else closeHistory();
});
historyMenu.addEventListener('click', (e) => { if (e.target === historyMenu) closeHistory(); });

// As in iOS menus, a touch that slides away from where it began picks nothing.
guardPresses(historyMenu);
document.getElementById('clearHistory').addEventListener('click', () => {
  prefs.history.set(withoutUnpinned(prefs.history.get()));
  updateHistory();
  closeHistory();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHistory(); });
updateHistory();
