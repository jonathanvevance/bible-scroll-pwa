import { unpackKey, verseName } from '../core/references.js';
import { el } from './dom.js';
import { LAST_VERSE } from './app-state.js';
import { jumpTo } from './feed.js';
import { DRAG_PX, withHaptic } from './haptics.js';

// ---------- History ----------
// Every jump (the chapter picker, a reference, a reflection card, a history entry) records the
// place being left: newest first, one entry per chapter, five at most. The History pill lists
// them, and shows whenever there is somewhere other than this chapter to go back to.

const HISTORY = 'history';
const HISTORY_SIZE = 5;
const historyButton = document.getElementById('historyButton');
const historyMenu = document.getElementById('historyMenu');
const historyList = document.getElementById('historyList');
const chapterOf = (key) => Math.floor(key / 1_000) * 1_000;

/** [{ key, time }], newest first. */
function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY)) ?? []; } catch { return []; }
}

/** Every entry outside the chapter being read. */
function historyPlaces() {
  const here = chapterOf(Number(localStorage.getItem(LAST_VERSE)));
  return readHistory().filter((h) => unpackKey(h.key) && chapterOf(h.key) !== here).slice(0, HISTORY_SIZE);
}

export function updateHistory() { historyButton.hidden = !historyPlaces().length; }

/** Call before jumping, while LAST_VERSE still holds the verse being read. */
export function rememberPlace() {
  const key = Number(localStorage.getItem(LAST_VERSE));
  if (!unpackKey(key)) return;
  const rest = readHistory().filter((h) => chapterOf(h.key) !== chapterOf(key));
  localStorage.setItem(HISTORY, JSON.stringify([{ key, time: Date.now() }, ...rest].slice(0, HISTORY_SIZE)));
}

/** "Now", "5 min", "2 h", "Yesterday", "Mon", or "3 Oct". */
function ago(time) {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(time).setHours(0, 0, 0, 0)) / 86_400_000);
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
  resetMenuTouch();
  historyMenu.hidden = false;
}

function closeHistory() { historyMenu.hidden = true; }

historyButton.addEventListener('click', () => { if (historyMenu.hidden) openHistory(); else closeHistory(); });
historyMenu.addEventListener('click', (e) => { if (e.target === historyMenu) closeHistory(); });

// As in iOS menus, a touch that slides away from where it began picks nothing: the row stops
// highlighting, the haptic switches (which would toggle on release) are disabled, and the click
// that follows the lift is swallowed.
let menuTouch = null;
function setMenuSwitches(on) {
  for (const input of historyMenu.querySelectorAll('.haptic')) input.disabled = !on;
}
function resetMenuTouch() {
  menuTouch = null;
  historyMenu.classList.remove('dragged');
  setMenuSwitches(true);
}
historyMenu.addEventListener('touchstart', (e) => {
  if (menuTouch?.moved) resetMenuTouch();
  menuTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
}, { passive: true });
function cancelMenuTouch() {
  if (!menuTouch || menuTouch.moved) return;
  menuTouch.moved = true;
  historyMenu.classList.add('dragged');
  setMenuSwitches(false);
}
historyMenu.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (menuTouch && Math.hypot(t.clientX - menuTouch.x, t.clientY - menuTouch.y) > DRAG_PX) cancelMenuTouch();
}, { passive: true });
historyMenu.addEventListener('touchend', () => {
  const ended = menuTouch;
  if (ended?.moved) setTimeout(() => { if (menuTouch === ended) resetMenuTouch(); }, 400);
}, { passive: true });
// iOS cancels the touch when it takes the gesture over (a long press, say). The finger may stay
// down long after, unseen by the page, and the switch still toggles on its release, so everything
// stays off until the next touch begins.
historyMenu.addEventListener('touchcancel', cancelMenuTouch, { passive: true });
historyMenu.addEventListener('click', (e) => {
  if (!menuTouch?.moved) return;
  e.preventDefault();
  e.stopPropagation();
}, true);
document.getElementById('clearHistory').addEventListener('click', () => {
  localStorage.removeItem(HISTORY);
  updateHistory();
  closeHistory();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHistory(); });
updateHistory();
