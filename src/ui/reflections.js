import { prefs } from '../data/prefs.js';
import { journal } from './app-state.js';
import { updateBackupReminder } from './backup.js';
import { appendByDay } from './cards.js';
import { openCard } from './liked.js';
import { guardPresses } from './pressable.js';
import { reflectionsView, registerTab } from './tabs.js';

// ---------- Reflections tab ----------

const reflectionsFilter = document.getElementById('reflectionsFilter');
export const reflectionsList = document.getElementById('reflectionsList');
reflectionsList.addEventListener('click', openCard);
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

/** Newest first, under a heading for each day, loaded a page at a time as the list scrolls. */
export function renderReflections() {
  if (!journal) return;
  for (const node of reflectionsFilter.children) node.classList.toggle('selected', node.dataset.range === filter);
  listing = { ...filterRange(filter), loaded: 0, done: false, loading: false, last: null };
  reflectionsList.replaceChildren();
  reflectionsEmpty.hidden = true;
  reflectionsView.scrollTop = 0;
  loadMoreReflections();
  updateBackupReminder();
}
registerTab('reflections', renderReflections);

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

// The filter and the backup banner scroll with the list; a scroll neither ticks nor presses them.
export const backupBanner = document.getElementById('backupBanner');
for (const control of [reflectionsFilter, backupBanner]) guardPresses(control, { scrollers: [reflectionsView] });
