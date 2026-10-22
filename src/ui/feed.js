import { advanceTarget, itemsFor, startFor, windowAfterSettling } from '../core/feed-model.js';
import { chapterName, verseName } from '../core/references.js';
import { LIKE, showLiked } from './actions.js';
import { LAST_VERSE, anySheetOpen, bible, currentIndex, currentItem, currentVerse, feed, journal, pageHeight, reduceMotion, state } from './app-state.js';
import { invalidateBackup, updateBackupReminder } from './backup.js';
import { el } from './dom.js';
import { rememberPlace, updateHistory } from './history.js';
import { railState, updateRail } from './rail.js';
import { fadeToVerse } from './sheets.js';
import { tab } from './tabs.js';

const ADVANCE_DELAY_MS = 700;
const SETTLE_DELAY_MS = 140;

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
export function show(window, pinID) {
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
export function updateActions() {
  for (const node of feed.querySelectorAll('.page.verse')) {
    const key = Number(node.dataset.id.slice(1));
    const text = String(journal.count(key) || '');
    const count = node.querySelector('.action-count');
    if (count.textContent !== text) count.textContent = text;
    showLiked(node.querySelector('.like'), journal.isMarked(LIKE, key));
  }
  invalidateBackup();
  updateBackupReminder();
}

// ---------- Settling and auto-advance ----------

export function settle() {
  if (state.touching || railState.scrubbing) return;
  const index = currentIndex();
  if (Math.abs(feed.scrollTop - index * pageHeight()) > 2) return; // still between pages
  const item = state.items[index];
  if (!item || item.id === state.settledID) return;

  const previousID = state.settledID;
  state.settledID = item.id;
  if (item.type === 'verse') {
    localStorage.setItem(LAST_VERSE, String(item.verse.key));
    updateHistory();
  }

  const next = windowAfterSettling(bible, item, state.window);
  if (next) show(next, item.id);
  updateControls();
  scheduleAdvance(item, previousID);
}

function scheduleAdvance(item, previousID) {
  clearTimeout(state.advanceTimer);
  const target = advanceTarget(item, previousID, state.items);
  if (!target) return;
  state.advanceTimer = setTimeout(() => {
    if (state.touching || anySheetOpen() || tab !== 'bible' || currentItem()?.id !== item.id) return;
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
  clearTimeout(state.advanceTimer);
  endGlide();
}, { passive: true });
for (const type of ['touchend', 'touchcancel']) {
  feed.addEventListener(type, () => { state.touching = false; settleSoon(); }, { passive: true });
}

addEventListener('resize', () => {
  const index = state.items.findIndex((i) => i.id === state.settledID);
  if (index >= 0) feed.scrollTop = index * pageHeight();
});

export function goToVerse(key) {
  const { window, id } = startFor(bible, key);
  clearTimeout(state.advanceTimer);
  show(window, id);
  state.settledID = id;
  localStorage.setItem(LAST_VERSE, id.slice(1));
  updateHistory();
}

export const jumpTo = (key) => { rememberPlace(); fadeToVerse(key); };
