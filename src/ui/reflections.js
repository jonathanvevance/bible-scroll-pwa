import { unpackKey, verseName } from '../core/references.js';
import { bible, journal } from './app-state.js';
import { backupReady, setBackupEnabled, updateBackupReminder } from './backup.js';
import { el } from './dom.js';
import { DRAG_PX } from './haptics.js';
import { openCard } from './liked.js';
import { reflectionsView } from './tabs.js';

// ---------- Reflections tab ----------

const FILTER = 'reflectionsFilter';
const reflectionsFilter = document.getElementById('reflectionsFilter');
export const reflectionsList = document.getElementById('reflectionsList');
reflectionsList.addEventListener('click', openCard);
const reflectionsEmpty = document.getElementById('reflectionsEmpty');
const PAGE_SIZE = 50;

let filter = localStorage.getItem(FILTER) ?? 'week';
if (!['today', 'week', 'month', 'all'].includes(filter)) filter = 'week';

/** The week starts on the day the phone's region uses (Sunday in the US, Monday in much of Europe). */
function weekStart(now) {
  const locale = new Intl.Locale(navigator.language);
  const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 1; // 1 = Monday … 7 = Sunday
  const daysBack = (now.getDay() - (firstDay % 7) + 7) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack);
}

/** Where a filter's period starts, in ms, and what to say when it holds nothing. */
function filterRange(f) {
  const now = new Date();
  if (f === 'today') return { from: +new Date(now.getFullYear(), now.getMonth(), now.getDate()), empty: 'No reflections today' };
  if (f === 'week') return { from: +weekStart(now), empty: 'No reflections this week' };
  if (f === 'month') return { from: +new Date(now.getFullYear(), now.getMonth(), 1), empty: 'No reflections this month' };
  return { from: 0, empty: 'No reflections yet' };
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const dayFormatWithYear = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export function dayName(ms) {
  const date = new Date(ms);
  return (date.getFullYear() === new Date().getFullYear() ? dayFormat : dayFormatWithYear).format(date);
}

export function timeOf(comment) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: comment.timeZoneID })
      .format(comment.createdAt);
  } catch {
    return new Date(comment.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}

function reflectionCard(comment) {
  const v = unpackKey(comment.verseKey);
  const card = el('button', { className: 'reflection-card' },
    el('span', { className: 'reflection-top' },
      el('span', { textContent: v ? verseName(v) : '' }),
      el('span', { className: 'reflection-time', textContent: timeOf(comment) })),
    el('span', { className: 'reflection-verse', textContent: v ? bible.books[v.book - 1]?.[v.chapter - 1]?.[v.verse - 1] ?? '' : '' }),
    el('span', { className: 'reflection-text', textContent: comment.body }));
  card.dataset.key = comment.verseKey;
  return card;
}

/** The list shown so far; replaced whenever the list starts over, which cancels a load in flight. */
let listing = null;

/** Newest first, under a heading for each day, loaded a page at a time as the list scrolls. */
export function renderReflections() {
  if (!journal) return;
  for (const node of reflectionsFilter.children) node.classList.toggle('selected', node.dataset.range === filter);
  listing = { ...filterRange(filter), loaded: 0, done: false, loading: false, day: null, list: null };
  reflectionsList.replaceChildren();
  reflectionsEmpty.hidden = true;
  reflectionsView.scrollTop = 0;
  loadMoreReflections();
  updateBackupReminder();
}

async function loadMoreReflections() {
  const run = listing;
  if (!run || run.loading || run.done) return;
  run.loading = true;
  const rows = await journal.page(run.from, run.loaded, PAGE_SIZE);
  if (run !== listing) return;
  run.loading = false;
  run.loaded += rows.length;
  run.done = rows.length < PAGE_SIZE;
  for (const comment of rows) {
    const name = dayName(comment.createdAt);
    if (name !== run.day) {
      run.day = name;
      run.list = el('ul', { className: 'reflection-cards' });
      reflectionsList.append(el('section', { className: 'reflection-day' },
        el('h2', { className: 'section-label', textContent: name }), run.list));
    }
    run.list.append(el('li', {}, reflectionCard(comment)));
  }
  reflectionsEmpty.textContent = run.empty;
  reflectionsEmpty.hidden = run.loaded > 0;
  loadIfNearEnd();
}

/** Keeps about a screen of cards ready below the visible ones. */
function loadIfNearEnd() {
  const v = reflectionsView;
  if (v.scrollTop + v.clientHeight > v.scrollHeight - v.clientHeight) loadMoreReflections();
}
reflectionsView.addEventListener('scroll', loadIfNearEnd, { passive: true });

function setFilter(next) {
  filter = next;
  localStorage.setItem(FILTER, next);
  renderReflections();
}

reflectionsFilter.addEventListener('click', (e) => {
  const range = e.target.closest('button[data-range]')?.dataset.range;
  if (range) setFilter(range);
});

// The filter and the backup banner scroll with the list. A native switch toggles when a drag ends
// on it, so once a touch starting on them moves, their switches are disabled: a scroll neither
// ticks nor presses.
export const backupBanner = document.getElementById('backupBanner');
const scrollingControls = [reflectionsFilter, backupBanner];
let controlTouch = null;
function setControlSwitches(on) {
  for (const control of scrollingControls) {
    for (const input of control.querySelectorAll('.haptic')) input.disabled = !on;
  }
  if (on) setBackupEnabled(backupReady !== null);
}
for (const control of scrollingControls) {
  control.addEventListener('touchstart', (e) => {
    controlTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
  }, { passive: true });
  control.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (controlTouch && !controlTouch.moved && Math.hypot(t.clientX - controlTouch.x, t.clientY - controlTouch.y) > DRAG_PX) {
      controlTouch.moved = true;
      setControlSwitches(false);
    }
  }, { passive: true });
  for (const type of ['touchend', 'touchcancel']) {
    control.addEventListener(type, () => {
      if (controlTouch?.moved) setTimeout(() => setControlSwitches(true), 400);
      controlTouch = null;
    }, { passive: true });
  }
}
