import { unpackKey } from '../core/references.js';
import { prefs } from '../data/prefs.js';
import { shareText, verseQuote } from './actions.js';
import { bible, journal } from './app-state.js';
import { updateBackupReminder } from './backup.js';
import { appendByDay } from './cards.js';
import { openCard } from './liked.js';
import { guardPresses } from './pressable.js';
import { reflectionsView, registerTab } from './tabs.js';

// ---------- Reflections tab ----------

const reflectionsFilter = document.getElementById('reflectionsFilter');
export const reflectionsList = document.getElementById('reflectionsList');
const reflectionsEmpty = document.getElementById('reflectionsEmpty');
const PAGE_SIZE = 50;

let filter = prefs.reflectionsFilter.get() ?? 'week';
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

/** The list shown so far; replaced whenever the list starts over, which cancels a load in flight. */
let listing = null;

const searchField = document.getElementById('reflectionsQuery');
const searching = () => reflectionsView.classList.contains('searching');
const fold = (s) => s.normalize('NFC').toLowerCase();
/** Every reflection, read once per search and dropped when the journal changes. */
let searchRows = null;

/**
 * Newest first, under a heading for each day, loaded a page at a time as the list scrolls.
 * While searching, the period is set aside: an empty search lists everything, and a query lists
 * every reflection whose own text holds it.
 */
export function renderReflections() {
  if (!journal) return;
  for (const node of reflectionsFilter.children) node.classList.toggle('selected', node.dataset.range === filter);
  const query = searching() ? searchField.value.trim() : '';
  listing = { ...filterRange(searching() ? 'all' : filter), query, loaded: 0, done: false, loading: false, last: null };
  reflectionsList.replaceChildren();
  shown.clear();
  reflectionsEmpty.hidden = true;
  reflectionsView.scrollTop = 0;
  if (query) showMatches();
  else loadMoreReflections();
  updateBackupReminder();
}
registerTab('reflections', () => { searchRows = null; renderReflections(); });

async function showMatches() {
  const run = listing;
  const all = searchRows ?? await journal.allComments();
  if (run !== listing) return;
  searchRows = all;
  const query = fold(run.query);
  const rows = all.filter((c) => fold(c.body).includes(query)).reverse();
  run.done = true;
  appendByDay(reflectionsList, rows);
  showChosen(rows);
  reflectionsEmpty.textContent = `No reflections contain “${run.query}”`;
  reflectionsEmpty.hidden = rows.length > 0;
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
  run.last = appendByDay(reflectionsList, rows, run.last);
  showChosen(rows);
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
  prefs.reflectionsFilter.set(next);
  renderReflections();
}

reflectionsFilter.addEventListener('click', (e) => {
  const range = e.target.closest('button[data-range]')?.dataset.range;
  if (range) setFilter(range);
});

const reflectionsSearch = document.getElementById('reflectionsSearch');
document.getElementById('searchButton').addEventListener('click', () => {
  reflectionsView.classList.add('searching');
  searchField.value = '';
  searchField.focus();
  renderReflections();
});
document.getElementById('searchCancel').addEventListener('click', () => {
  reflectionsView.classList.remove('searching');
  searchField.value = '';
  searchField.blur();
  searchRows = null;
  renderReflections();
});
searchField.addEventListener('input', renderReflections);
// Return, or dragging the list, puts the keyboard away and keeps the results.
reflectionsSearch.addEventListener('submit', (e) => { e.preventDefault(); searchField.blur(); });
reflectionsList.addEventListener('touchmove', () => searchField.blur(), { passive: true });

// ---------- Choosing reflections to share ----------

const choosing = () => reflectionsView.classList.contains('choosing');
const reflectionsTitle = document.getElementById('reflectionsTitle');
const chooseShare = document.getElementById('chooseShare');
const chooseShareLabel = document.getElementById('chooseShareLabel');
/** Chosen reflections by id, so a choice outlasts the list being redrawn. */
const chosen = new Map();
/** Every reflection on screen by id, to look up the one behind a tapped card. */
const shown = new Map();
/** How long a finger rests on a card before choosing starts, as a long press does in Photos. */
const LONG_PRESS_MS = 500;

function showChosen(rows) {
  for (const row of rows) shown.set(row.id, row);
  if (!chosen.size) return;
  for (const card of reflectionsList.querySelectorAll('.reflection-card')) {
    card.classList.toggle('chosen', chosen.has(card.dataset.id));
  }
}

function updateChoosing() {
  const n = chosen.size;
  reflectionsTitle.textContent = !choosing() ? 'Reflections' : n ? `${n} Selected` : 'Choose to share';
  chooseShareLabel.textContent = n ? `Share ${n}` : 'Share';
  chooseShare.disabled = !n;
}

function startChoosing() {
  if (choosing()) return;
  reflectionsView.classList.add('choosing');
  searchField.readOnly = true;
  searchField.blur();
  updateChoosing();
}

function stopChoosing() {
  reflectionsView.classList.remove('choosing');
  searchField.readOnly = false;
  chosen.clear();
  for (const card of reflectionsList.querySelectorAll('.reflection-card.chosen')) card.classList.remove('chosen');
  updateChoosing();
}

function toggleChosen(card) {
  const row = shown.get(card.dataset.id);
  if (!row) return;
  if (chosen.delete(row.id)) card.classList.remove('chosen');
  else {
    chosen.set(row.id, row);
    card.classList.add('chosen');
  }
  updateChoosing();
}

const dateOf = (c) => {
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: c.timeZoneID }).format(c.createdAt);
  } catch {
    return new Date(c.createdAt).toLocaleDateString();
  }
};

/** Oldest first, like a journal: each verse, the reflection on it, and the day it was written. */
chooseShare.addEventListener('click', () => {
  const rows = [...chosen.values()].sort((a, b) => a.createdAt - b.createdAt);
  const text = rows.map((c) => {
    const v = { ...unpackKey(c.verseKey), text: bible.text(c.verseKey) ?? '' };
    return `${verseQuote(v)}\n${c.body}\n— ${dateOf(c)}`;
  }).join('\n\n');
  shareText(text, rows.length > 1 ? 'Reflections copied' : 'Reflection copied');
});

for (const button of document.querySelectorAll('#reflectionsView .choose-button')) button.addEventListener('click', startChoosing);
document.getElementById('chooseCancel').addEventListener('click', stopChoosing);

let pressTimer = null;
let longPressed = false;
reflectionsList.addEventListener('touchstart', (e) => {
  longPressed = false;
  const card = e.target.closest('.reflection-card');
  if (!card || choosing() || e.touches.length > 1) return;
  pressTimer = setTimeout(() => {
    longPressed = true;
    startChoosing();
    toggleChosen(card);
  }, LONG_PRESS_MS);
}, { passive: true });
for (const type of ['touchmove', 'touchend', 'touchcancel']) {
  reflectionsList.addEventListener(type, () => clearTimeout(pressTimer), { passive: true });
}

reflectionsList.addEventListener('click', (e) => {
  if (longPressed) return void (longPressed = false);
  const card = e.target.closest('.reflection-card');
  if (choosing()) { if (card) toggleChosen(card); } else openCard(e);
});

export const backupBanner = document.getElementById('backupBanner');
for (const control of [reflectionsFilter, backupBanner]) guardPresses(control);
