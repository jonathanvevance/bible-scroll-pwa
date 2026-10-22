import { advanceTarget, itemsFor, startFor, windowAfterSettling } from '../core/feed-model.js';
import { chapterName, verseName } from '../core/references.js';
import { prefs } from '../data/prefs.js';
import { LIKE, showLiked } from './actions.js';
import { anySheetOpen, bible, feed, journal, onJournalChange, reduceMotion } from './app-state.js';
import { el } from './dom.js';
import { rememberPlace, updateHistory } from './history.js';
import { isScrubbing, updateRail } from './rail.js';
import { fadeToVerse } from './sheets.js';
import { currentTab } from './tabs.js';

const ADVANCE_DELAY_MS = 700;
const SETTLE_DELAY_MS = 140;

/** The chapters loaded, their pages, and what the feed is doing. Only this module changes them. */
const state = {
  window: [],
  items: [],
  settledID: null,
  touching: false,
  settleTimer: 0,
  advanceTimer: 0,
  glideTop: null,
  glideTimer: 0,
};

// Pages can be a fractional height; clientHeight rounds, which drifts over long chapters.
function pageHeight() {
  return feed.firstElementChild?.getBoundingClientRect().height || feed.clientHeight;
}
function currentIndex() {
  return Math.round(feed.scrollTop / pageHeight());
}
function currentItem() {
  return state.items[currentIndex()];
}
export function currentVerse() {
  const item = currentItem();
  return item?.type === 'verse' ? item.verse : null;
}
/** The verse being read, or between chapters the first chapter loaded. */
export function readingPlace() {
  return currentVerse() ?? state.window[0];
}
export function itemFor(id) {
  return state.items.find((i) => i.id === id);
}
/** The ids of the loaded pages of `v`'s chapter, in order. */
export function chapterPageIDs(v) {
  return state.items
    .filter((i) => i.type === 'verse' && i.verse.book === v.book && i.verse.chapter === v.chapter)
    .map((i) => i.id);
}
export function scrollToPage(id) {
  feed.scrollTop = state.items.findIndex((i) => i.id === id) * pageHeight();
}
/** Cancels a pending move to the next chapter. */
export function stopAdvance() {
  clearTimeout(state.advanceTimer);
}

// ---------- Rendering ----------

const actionsTemplate = document.getElementById('actionsTemplate');

function page(item) {
  const node = el('section', { className: `page ${item.type}` });
  node.dataset.id = item.id;
  if (item.type === 'verse') {
    const v = item.verse;
    // Titles are set smaller than the verse, so they count for half.
    const length = v.text.length + (v.title ?? '').length / 2;
    if (length > 220) node.classList.add('long');
    if (length > 380) node.classList.add('very-long');
    // A psalm's title and Habakkuk's closing note sit outside the verse, as in printed Bibles.
    node.append(el('div', { className: 'verse-body' },
      v.title ? el('p', { className: 'verse-title', textContent: v.title }) : null,
      el('p', { className: 'verse-text', textContent: v.text }),
      v.note ? el('p', { className: 'verse-note', textContent: v.note }) : null,
      el('p', { className: 'reference', textContent: verseName(v) })));
    const actions = actionsTemplate.content.firstElementChild.cloneNode(true);
    actions.querySelector('.action-count').textContent = journal.count(v.key) || '';
    showLiked(actions.querySelector('.like'), journal.isMarked(LIKE, v.key));
    node.append(actions);
  } else {
    node.append(el('div', { className: 'boundary-body' },
      item.before ? el('p', { className: 'end-of', textContent: `End of ${chapterName(item.before)}` }) : null,
      el('h1', { className: 'chapter-title', textContent: item.after ? chapterName(item.after) : 'The end' })));
  }
  return node;
}

/** Swap the feed's content and re-pin the same page in one synchronous step, so the
 *  change above the visible page is never painted. */
function show(window, pinID) {
  state.window = window;
  state.items = itemsFor(bible, window);
  feed.replaceChildren(...state.items.map(page));
  const index = Math.max(0, state.items.findIndex((i) => i.id === pinID));
  feed.scrollTop = index * pageHeight();
  updateControls();
}

const chapterLabel = document.getElementById('chapterLabel');

/** Cheap enough to run on every scroll event: each part only writes when it changes. */
function updateControls() {
  const item = currentItem();
  const v = currentVerse();
  const chapter = v ?? item?.after ?? item?.before;
  const label = chapter ? chapterName(chapter) : '';
  if (chapterLabel.textContent !== label) chapterLabel.textContent = label;
  updateRail();
}

/** Refreshes the counts and hearts on the rendered pages after reflections or likes change. */
function updateActions() {
  for (const node of feed.querySelectorAll('.page.verse')) {
    const key = Number(node.dataset.id.slice(1));
    const text = String(journal.count(key) || '');
    const count = node.querySelector('.action-count');
    if (count.textContent !== text) count.textContent = text;
    showLiked(node.querySelector('.like'), journal.isMarked(LIKE, key));
  }
}
onJournalChange(updateActions);

// ---------- Settling and auto-advance ----------

export function settle() {
  if (state.touching || isScrubbing()) return;
  const index = currentIndex();
  if (Math.abs(feed.scrollTop - index * pageHeight()) > 2) return; // still between pages
  const item = state.items[index];
  if (!item || item.id === state.settledID) return;

  const previousID = state.settledID;
  state.settledID = item.id;
  if (item.type === 'verse') {
    prefs.lastVerse.set(item.verse.key);
    updateHistory();
  }

  const next = windowAfterSettling(bible, item, state.window);
  if (next) show(next, item.id);
  updateControls();
  scheduleAdvance(item, previousID);
}

function scheduleAdvance(item, previousID) {
  stopAdvance();
  const target = advanceTarget(item, previousID, state.items);
  if (!target) return;
  state.advanceTimer = setTimeout(() => {
    if (state.touching || anySheetOpen() || currentTab() !== 'bible' || currentItem()?.id !== item.id) return;
    glideTo(state.items.findIndex((i) => i.id === target));
  }, ADVANCE_DELAY_MS);
}

/**
 * Animated scroll to a page. iOS snaps a smooth programmatic scroll back to the page the
 * finger last snapped to, so snapping is switched off for the glide; if the animation is
 * dropped anyway, land on the page directly.
 */
function glideTo(index) {
  const top = index * pageHeight();
  if (reduceMotion.matches) {
    feed.scrollTop = top;
    return;
  }
  state.glideTop = top;
  feed.style.scrollSnapType = 'none';
  feed.scrollTo({ top, behavior: 'smooth' });
  clearTimeout(state.glideTimer);
  state.glideTimer = setTimeout(() => {
    if (!state.touching && Math.abs(feed.scrollTop - top) > 2) feed.scrollTop = top;
    endGlide();
  }, 900);
}

export function endGlide() {
  if (state.glideTop == null) return;
  clearTimeout(state.glideTimer);
  state.glideTop = null;
  feed.style.scrollSnapType = '';
  settleSoon();
}

export function settleSoon() {
  clearTimeout(state.settleTimer);
  state.settleTimer = setTimeout(settle, SETTLE_DELAY_MS);
}

feed.addEventListener('scroll', () => {
  updateControls();
  if (state.glideTop != null && Math.abs(feed.scrollTop - state.glideTop) <= 2) endGlide();
  settleSoon();
}, { passive: true });
feed.addEventListener('scrollend', () => { clearTimeout(state.settleTimer); settle(); });
feed.addEventListener('touchstart', () => {
  state.touching = true;
  stopAdvance();
  endGlide();
}, { passive: true });
for (const type of ['touchend', 'touchcancel']) {
  feed.addEventListener(type, () => { state.touching = false; settleSoon(); }, { passive: true });
}

addEventListener('resize', () => {
  const index = state.items.findIndex((i) => i.id === state.settledID);
  if (index >= 0) feed.scrollTop = index * pageHeight();
});

/** Shows verse `key`, or the nearest place there is, without remembering it as the place read. */
export function openAt(key) {
  const { window, id } = startFor(bible, key);
  stopAdvance();
  endGlide(); // its timer would pull the feed back to where the glide was going
  show(window, id);
  state.settledID = id;
  return id;
}

export function goToVerse(key) {
  prefs.lastVerse.set(Number(openAt(key).slice(1)));
  updateHistory();
}

export const jumpTo = (key) => { rememberPlace(); fadeToVerse(key); };
