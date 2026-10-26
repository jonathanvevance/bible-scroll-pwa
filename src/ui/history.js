import { daysAgo } from '../core/dates.js';
import {
  MAX_PINS, chapterOf, isFollowing, isPinned, ordered, pinCount, remember, togglePin, withoutUnpinned,
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
// lists them, pins first, with the place being read among them as "Now", so it can be pinned.
// Opening a pin, or pinning "Now", puts the reader on that track, shown by a pin on the chapter
// pill; scrolling keeps them on it, and any jump takes them off.

const historyButton = document.getElementById('historyButton');
const trackPin = document.getElementById('trackPin');
const historyMenu = document.getElementById('historyMenu');
const historyList = document.getElementById('historyList');

const isHere = (h) => chapterOf(h.key) === chapterOf(prefs.lastVerse.get());
const following = () => prefs.followingPin.get() || null;

/** The stored list as it would be on leaving now: the place being read recorded as just left. */
function withHere() {
  const key = prefs.lastVerse.get();
  const list = prefs.history.get();
  return unpackKey(key) ? remember(list, key, Date.now(), following()) : list;
}

/** Every entry, in the order the menu shows them. */
const historyPlaces = () => ordered(withHere()).filter((h) => unpackKey(h.key));

export function updateHistory() {
  historyButton.hidden = !historyPlaces().length;
  trackPin.hidden = !isFollowing(prefs.history.get(), following());
}

/** Call before jumping, while `prefs.lastVerse` still holds the verse being read. Ends following. */
export function rememberPlace() {
  const key = prefs.lastVerse.get();
  if (unpackKey(key)) prefs.history.set(remember(prefs.history.get(), key, Date.now(), following()));
  prefs.followingPin.clear();
}

const PIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5"/>'
  + '<path d="M5 17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2Z"/></svg>';

function pinButton(h, pinsFull) {
  const pin = isPinned(h);
  const button = el('button', { className: 'history-pin', innerHTML: PIN_ICON, ariaLabel: pin ? 'Unpin' : 'Pin' });
  button.setAttribute('aria-pressed', String(pin));
  if (!pin && pinsFull) button.classList.add('full');
  button.addEventListener('click', () => {
    const time = Date.now();
    const next = togglePin(withHere(), h.key, time, h.pinnedAt ?? null);
    if (!next) return toast('Unpin one to pin this');
    prefs.history.set(next);
    if (!pin && isHere(h)) prefs.followingPin.set(time);
    renderHistory();
    updateHistory();
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
    place.addEventListener('click', () => {
      closeHistory();
      if (isPinned(h) ? h.pinnedAt === following() : isHere(h)) return;
      jumpTo(h.key);
      if (isPinned(h)) prefs.followingPin.set(h.pinnedAt);
      updateHistory();
    });
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
