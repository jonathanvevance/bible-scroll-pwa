import { BOOKS } from './books.js';
import { Journal } from './journal.js';

const LAST_VERSE = 'lastVerseKey';
const ADVANCE_DELAY_MS = 700;
const SETTLE_DELAY_MS = 140;

// ---------- References (same packed key as the iOS app: book*1e6 + chapter*1e3 + verse) ----------

const packKey = (book, chapter, verse = 0) => book * 1_000_000 + chapter * 1_000 + verse;
const bookInfo = (order) => BOOKS[order - 1];
const chapterName = (ch) => `${bookInfo(ch.book).bsbName} ${ch.chapter}`;
const verseName = (v) => `${bookInfo(v.book).bsbName} ${v.chapter}:${v.verse}`;

function unpackKey(key) {
  const book = Math.floor(key / 1_000_000);
  const chapter = Math.floor((key % 1_000_000) / 1_000);
  const verse = key % 1_000;
  if (!bookInfo(book) || chapter < 1 || verse < 1) return null;
  return { book, chapter, verse };
}

/** [title, Bible Hub path, SVG icon paths (24×24, stroked)] */
const HUB_TOOLS = [
  ['Compare translations', (s, c, v) => `parallel/${s}/${c}-${v}.htm`,
    '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>'],
  ['Read chapter context', (s, c) => `${s}/${c}.htm`,
    '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>'],
  ['Cross-references', (s, c, v) => `crossref/${s}/${c}-${v}.htm`,
    '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'],
  ['Commentaries', (s, c, v) => `commentaries/${s}/${c}-${v}.htm`,
    '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h7"/>'],
];
const hubURL = (tool, v) => `https://biblehub.com/${tool(bookInfo(v.book).slug, v.chapter, v.verse)}`;

// ---------- Bible text ----------

class Bible {
  constructor(books) {
    this.books = books;
    this.chapters = [];
    this.index = new Map();
    books.forEach((chapters, b) => chapters.forEach((_, c) => {
      const ch = { book: b + 1, chapter: c + 1, key: packKey(b + 1, c + 1) };
      this.index.set(ch.key, this.chapters.length);
      this.chapters.push(ch);
    }));
  }

  chapter(book, chapter) {
    return this.chapters[this.index.get(packKey(book, chapter))] ?? null;
  }

  verses(ch) {
    return this.books[ch.book - 1][ch.chapter - 1].map((text, i) => ({
      book: ch.book, chapter: ch.chapter, verse: i + 1, key: ch.key + i + 1, text,
    }));
  }

  after(ch) { return this.chapters[this.index.get(ch.key) + 1] ?? null; }
  before(ch) { return this.chapters[this.index.get(ch.key) - 1] ?? null; }
}

// ---------- Feed model (mirrors BibleCore's ChapterFeed) ----------
// The feed shows a window of chapters bracketed by boundary pages: the chapter being
// read plus one either side, so a boundary is never a dead end and the reader can
// swipe straight through it. Settling on a verse in another chapter recentres the
// window. A boundary's id is the same in every window that contains it.

const boundary = (before, after) => ({ type: 'boundary', id: `b${before?.key ?? 0}-${after?.key ?? 0}`, before, after });
const verseItem = (verse) => ({ type: 'verse', id: `v${verse.key}`, verse });

function itemsFor(window) {
  const items = [boundary(bible.before(window[0]), window[0])];
  for (const ch of window) {
    for (const v of bible.verses(ch)) if (v.text) items.push(verseItem(v));
    items.push(boundary(ch, bible.after(ch)));
  }
  return items;
}

const windowAround = (ch) => [bible.before(ch), ch, bible.after(ch)].filter(Boolean);

function windowAfterSettling(item) {
  if (item.type !== 'verse') return null;
  const next = windowAround(bible.chapter(item.verse.book, item.verse.chapter));
  const same = next.length === state.window.length && next.every((ch, i) => ch.key === state.window[i].key);
  return same ? null : next;
}

/** Saved verse -> its chapter and page; unknown keys fall back to Genesis 1:1. */
function startFor(key) {
  const ref = unpackKey(key);
  const chapter = (ref && bible.chapter(ref.book, ref.chapter)) ?? bible.chapters[0];
  const verses = itemsFor([chapter]).filter((i) => i.type === 'verse');
  const page = verses.find((i) => i.verse.key === key) ?? verses[0];
  return { window: windowAround(chapter), id: page.id };
}

/**
 * Where to carry on after resting on a boundary: forward to the next chapter's first
 * verse, or back to the previous chapter's last verse, depending on which side the
 * reader came from. End caps never advance.
 */
function advanceTarget(item, previousID) {
  if (item.type !== 'boundary' || !item.before || !item.after) return null;
  if (!previousID?.startsWith('v')) return null;
  const forward = Number(previousID.slice(1)) < item.after.key;
  const verses = state.items.filter((i) => i.type === 'verse');
  const target = forward
    ? verses.find((i) => i.verse.book === item.after.book && i.verse.chapter === item.after.chapter)
    : verses.findLast((i) => i.verse.book === item.before.book && i.verse.chapter === item.before.chapter);
  return target?.id ?? null;
}

// ---------- State ----------

const feed = document.getElementById('feed');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let bible;
let journal;
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
const pageHeight = () => feed.firstElementChild?.getBoundingClientRect().height || feed.clientHeight;
const currentIndex = () => Math.round(feed.scrollTop / pageHeight());
const currentItem = () => state.items[currentIndex()];
const currentVerse = () => (currentItem()?.type === 'verse' ? currentItem().verse : null);
const anySheetOpen = () => document.querySelector('dialog[open]') !== null;

// ---------- Rendering ----------

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function page(item) {
  const node = el('section', { className: `page ${item.type}` });
  node.dataset.id = item.id;
  if (item.type === 'verse') {
    const v = item.verse;
    if (v.text.length > 220) node.classList.add('long');
    if (v.text.length > 380) node.classList.add('very-long');
    node.append(el('div', { className: 'verse-body' },
      el('p', { className: 'verse-text', textContent: v.text }),
      el('p', { className: 'reference', textContent: verseName(v) })));
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
  state.items = itemsFor(window);
  feed.replaceChildren(...state.items.map(page));
  const index = Math.max(0, state.items.findIndex((i) => i.id === pinID));
  feed.scrollTop = index * pageHeight();
  updateControls();
}

const chapterLabel = document.getElementById('chapterLabel');
const reflectCount = document.getElementById('reflectCount');

/** Cheap enough to run on every scroll event: each part only writes when it changes. */
function updateControls() {
  const item = currentItem();
  const v = currentVerse();
  document.body.classList.toggle('on-boundary', !v);
  const chapter = v ?? item?.after ?? item?.before;
  const label = chapter ? chapterName(chapter) : '';
  if (chapterLabel.textContent !== label) chapterLabel.textContent = label;
  if (v) updateActions(v);
  updateRail();
}

function updateActions(v = currentVerse()) {
  if (!v) return;
  const n = journal.count(v.key);
  const text = n ? String(n) : '';
  if (reflectCount.textContent !== text) reflectCount.textContent = text;
}

let toastTimer = 0;
function toast(message) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 1600);
}

// ---------- Verse rail ----------

const rail = document.getElementById('rail');
const railTrack = document.getElementById('railTrack');
const railLabel = document.getElementById('railLabel');
const railNumber = document.getElementById('railNumber');
const railState = { chapterKey: 0, ids: [], current: -1, scrubbing: false, scrubIndex: -1 };

function updateRail() {
  const v = currentVerse();
  rail.hidden = !v;
  if (!v) return;
  const chapterKey = packKey(v.book, v.chapter);
  if (chapterKey !== railState.chapterKey) {
    railState.chapterKey = chapterKey;
    railState.ids = state.items
      .filter((i) => i.type === 'verse' && i.verse.book === v.book && i.verse.chapter === v.chapter)
      .map((i) => i.id);
    railTrack.style.gap = railState.ids.length > 80 ? '1px' : '2px';
    railTrack.replaceChildren(...railState.ids.map(() => document.createElement('span')));
    railState.current = -1;
  }
  const index = railState.ids.indexOf(`v${v.key}`);
  if (index === railState.current) return;
  railTrack.children[railState.current]?.classList.remove('current');
  railTrack.children[index]?.classList.add('current');
  railState.current = index;
  railNumber.textContent = String(v.verse);
  railNumber.style.top = `${((index + 0.5) / railState.ids.length) * 100}%`;
}

function scrubTo(clientY) {
  const box = railTrack.getBoundingClientRect();
  const n = railState.ids.length;
  const index = Math.min(n - 1, Math.max(0, Math.floor(((clientY - box.top) / box.height) * n)));
  if (index === railState.scrubIndex) return;
  railState.scrubIndex = index;
  const id = railState.ids[index];
  feed.scrollTop = state.items.findIndex((i) => i.id === id) * pageHeight();
  const v = state.items.find((i) => i.id === id).verse;
  railLabel.textContent = verseName(v);
  railLabel.style.top = `${box.top + ((index + 0.5) / n) * box.height}px`;
  railLabel.hidden = false;
  tick();
}

rail.addEventListener('pointerdown', (e) => {
  if (!railState.ids.length) return;
  try { rail.setPointerCapture(e.pointerId); } catch {}
  railState.scrubbing = true;
  railState.scrubIndex = -1;
  clearTimeout(state.advanceTimer);
  endGlide();
  scrubTo(e.clientY);
});
rail.addEventListener('pointermove', (e) => { if (railState.scrubbing) scrubTo(e.clientY); });
for (const type of ['pointerup', 'pointercancel']) {
  rail.addEventListener(type, () => {
    railState.scrubbing = false;
    railLabel.hidden = true;
    settleSoon();
  });
}

/**
 * A light haptic tap. Android has the Vibration API; iOS Safari does not, but toggling
 * a native switch control (iOS 18+) plays the system's switch haptic.
 */
function tick() {
  if (navigator.vibrate) {
    navigator.vibrate(8);
    return;
  }
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}

// ---------- Settling and auto-advance ----------

function settle() {
  if (state.touching || railState.scrubbing) return;
  const index = currentIndex();
  if (Math.abs(feed.scrollTop - index * pageHeight()) > 2) return; // still between pages
  const item = state.items[index];
  if (!item || item.id === state.settledID) return;

  const previousID = state.settledID;
  state.settledID = item.id;
  if (item.type === 'verse') localStorage.setItem(LAST_VERSE, String(item.verse.key));

  const next = windowAfterSettling(item);
  if (next) show(next, item.id);
  updateControls();
  scheduleAdvance(item, previousID);
}

function scheduleAdvance(item, previousID) {
  clearTimeout(state.advanceTimer);
  const target = advanceTarget(item, previousID);
  if (!target) return;
  state.advanceTimer = setTimeout(() => {
    if (state.touching || anySheetOpen() || currentItem()?.id !== item.id) return;
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

function endGlide() {
  if (state.glideTop == null) return;
  clearTimeout(state.glideTimer);
  state.glideTop = null;
  feed.style.scrollSnapType = '';
  settleSoon();
}

function settleSoon() {
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

function goToVerse(key) {
  const { window, id } = startFor(key);
  clearTimeout(state.advanceTimer);
  show(window, id);
  state.settledID = id;
  localStorage.setItem(LAST_VERSE, id.slice(1));
}

const jumpTo = (chapter) => fadeToVerse(chapter.key + 1);

// ---------- Verse actions ----------

document.getElementById('shareButton').addEventListener('click', async () => {
  const v = currentVerse();
  if (!v) return;
  const text = `“${v.text}” (${verseName(v)}, BSB)`;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Verse copied');
  } catch {
    toast("Couldn't share");
  }
});

// ---------- Sheets ----------

const SHEET_CLOSE_MS = 260;

/** Slides the sheet away before closing it; resolves once it is gone. */
function closeSheet(dialog) {
  if (!dialog.open || dialog.classList.contains('closing')) return Promise.resolve();
  if (reduceMotion.matches) { dialog.close(); return Promise.resolve(); }
  dialog.classList.add('closing');
  return new Promise((resolve) => setTimeout(() => {
    dialog.classList.remove('closing');
    dialog.close();
    resolve();
  }, SHEET_CLOSE_MS));
}

/** Cross-fades the feed to another place instead of cutting to it. */
function fadeToVerse(key) {
  if (reduceMotion.matches || !document.startViewTransition) goToVerse(key);
  else document.startViewTransition(() => goToVerse(key));
}

/** Slides a view in from the side, like moving through a navigation stack. */
function slideIn(node, from) {
  if (reduceMotion.matches) return;
  node.animate(
    [{ opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 300, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
  );
}

// iOS only shows :active press states when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) closeSheet(dialog);
  });
  dialog.addEventListener('close', () => clearTimeout(state.advanceTimer));
  // One scroller at a time: a swipe only moves the area under the finger if that area can
  // scroll; otherwise it is swallowed, so the page behind never pans or scrolls.
  dialog.addEventListener('touchmove', (e) => {
    for (let node = e.target; node && node !== dialog; node = node.parentElement) {
      if (!node.matches('.sheet-body, textarea')) continue;
      const canScroll = node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY !== 'hidden';
      if (canScroll) return;
    }
    e.preventDefault();
  }, { passive: false });
}

// Keep sheets above the keyboard: the layout viewport does not shrink when it opens.
function trackKeyboard() {
  const vv = visualViewport;
  const keyboard = Math.max(0, innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--keyboard', `${keyboard}px`);
  document.documentElement.style.setProperty('--viewport-height', `${vv.height}px`);
  document.documentElement.style.setProperty('--viewport-top', `${vv.offsetTop}px`);
  document.documentElement.classList.toggle('keyboard-up', keyboard > 80);
}
visualViewport?.addEventListener('resize', trackKeyboard);
visualViewport?.addEventListener('scroll', trackKeyboard);

// Reflections timeline

const timeline = document.getElementById('timeline');
const composerText = document.getElementById('composerText');
let timelineVerse = null;

function stamp(comment) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: comment.timeZoneID,
    }).format(comment.createdAt);
  } catch {
    return new Date(comment.createdAt).toLocaleString();
  }
}

const timelineBody = document.getElementById('timelineBody');
const scrollTimelineToEnd = () => { timelineBody.scrollTop = timelineBody.scrollHeight; };
/** Brings the "New reflection" label to the top so what you type stays in view. */
const scrollToComposer = () => {
  const label = timelineBody.querySelector('.note-label');
  timelineBody.scrollTop += label.getBoundingClientRect().top - timelineBody.getBoundingClientRect().top;
};

/** Oldest first, like a journal, with the box for a new reflection after the latest. */
async function renderTimeline() {
  const comments = (await journal.comments(timelineVerse.key)).reverse();
  document.getElementById('timelineCount').textContent =
    comments.length === 0 ? '' : comments.length === 1 ? 'Reflection' : `Reflections (${comments.length})`;
  document.getElementById('timelineList').replaceChildren(...comments.map((c) => {
    const del = el('button', { className: 'delete', textContent: 'Delete' });
    del.addEventListener('click', async () => {
      if (!confirm('Delete this reflection?')) return;
      await journal.delete(c);
      updateActions();
      renderTimeline();
    });
    return el('li', {},
      el('div', { className: 'reflection-meta' }, el('span', { textContent: stamp(c) }), del),
      el('p', { className: 'reflection-body', textContent: c.body }));
  }));
}

function sizeComposer() {
  composerText.style.height = 'auto';
  composerText.style.height = `${composerText.scrollHeight}px`;
}
composerText.addEventListener('input', sizeComposer);

/** Saves whatever is in the writing area as a new reflection. */
async function saveDraft() {
  if (!timelineVerse || !composerText.value.trim()) return;
  try {
    await journal.add(composerText.value, timelineVerse.key);
    composerText.value = '';
    sizeComposer();
    updateActions();
    await renderTimeline();
    scrollTimelineToEnd();
  } catch (error) {
    alert(`Couldn't save: ${error?.message ?? error}`);
  }
}

// Done or a tap outside closes the sheet; neither loses the text.
timeline.addEventListener('close', saveDraft);

document.getElementById('reflectButton').addEventListener('click', () => {
  timelineVerse = currentVerse();
  if (!timelineVerse) return;
  document.getElementById('timelineTitle').textContent = verseName(timelineVerse);
  document.getElementById('timelineVerse').textContent = timelineVerse.text;
  document.getElementById('timelineCount').textContent = '';
  document.getElementById('timelineList').replaceChildren();
  composerText.value = '';
  sizeComposer();
  timeline.showModal();
  renderTimeline().then(scrollTimelineToEnd);
});

// While writing, the sheet fills the visible screen above the keyboard. Keyed off focus because a
// Home Screen app may shrink innerHeight along with the visual viewport, hiding the keyboard height.
let leaveWriting;
composerText.addEventListener('focus', () => {
  clearTimeout(leaveWriting);
  trackKeyboard();
  document.documentElement.classList.add('writing');
  setTimeout(() => { trackKeyboard(); scrollToComposer(); }, 350);
});
// Delayed so a tap on Done lands before the sheet shrinks back under the finger.
composerText.addEventListener('blur', () => {
  leaveWriting = setTimeout(() => {
    document.documentElement.classList.remove('writing');
    scrollTimelineToEnd();
  }, 250);
});
timeline.addEventListener('close', () => document.documentElement.classList.remove('writing'));

// Study (Bible Hub)

const study = document.getElementById('study');
const debug = location.hash.includes('debug');
document.getElementById('debugSection').hidden = !debug;

document.getElementById('studyButton').addEventListener('click', () => {
  const v = currentVerse();
  if (!v) return;
  document.getElementById('studyTitle').textContent = verseName(v);
  document.getElementById('studyVerse').textContent = v.text;
  document.getElementById('studyLinks').replaceChildren(...HUB_TOOLS.map(([title, tool, icon]) => {
    const link = el('a', { href: hubURL(tool, v), target: '_blank', rel: 'noopener' });
    link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    link.append(el('span', { textContent: title }));
    return el('li', {}, link);
  }));
  study.showModal();
});

document.getElementById('seedButton').addEventListener('click', async () => {
  const verses = bible.chapters.flatMap((ch) => bible.verses(ch)).filter((v) => v.text);
  const now = Date.now();
  const entries = Array.from({ length: 500 }, (_, i) => ({
    verseKey: verses[Math.floor(Math.random() * verses.length)].key,
    body: `Seeded reflection #${i + 1}.`,
    createdAt: now - Math.floor(Math.random() * 90 * 86_400_000),
  }));
  await journal.addMany(entries);
  updateActions();
  closeSheet(study);
});

document.getElementById('wipeButton').addEventListener('click', async () => {
  if (!confirm('Delete every reflection?')) return;
  await journal.deleteAll();
  updateActions();
  closeSheet(study);
});

// Jump to

const jump = document.getElementById('jump');
const bookView = document.getElementById('bookView');
const chapterView = document.getElementById('chapterView');
const jumpBack = document.getElementById('jumpBack');
const jumpTitle = document.getElementById('jumpTitle');
const bookSearch = document.getElementById('bookSearch');
const testaments = document.getElementById('testaments');
let testament = 'old';

const squash = (s) => s.toLowerCase().replaceAll(' ', '');

function renderBooks() {
  const query = squash(bookSearch.value);
  testaments.hidden = query !== '';
  for (const b of testaments.children) b.classList.toggle('selected', b.dataset.testament === testament);
  const books = query
    ? BOOKS.filter((b) => [b.name, b.bsbName, b.usfm].some((n) => squash(n).includes(query)))
    : BOOKS.filter((b) => (b.order <= 39) === (testament === 'old'));
  document.getElementById('bookList').replaceChildren(...books.map((b) => {
    const button = el('button', { className: 'chevron', textContent: b.name });
    button.addEventListener('click', () => { showChapters(b.order); slideIn(chapterView, 40); });
    return el('li', {}, button);
  }));
}

function showBooks() {
  chapterView.hidden = true;
  bookView.hidden = false;
  jumpBack.hidden = true;
  jumpTitle.textContent = 'Books';
  renderBooks();
}
jumpBack.addEventListener('click', () => slideIn(bookView, -40));

function showChapters(order) {
  const book = bookInfo(order);
  const here = currentItem()?.verse ?? state.window[0];
  testament = order <= 39 ? 'old' : 'new';
  bookView.hidden = true;
  chapterView.hidden = false;
  jumpBack.hidden = false;
  jumpTitle.textContent = book.name;
  const grid = document.getElementById('chapterGrid');
  grid.replaceChildren(...Array.from({ length: book.chapters }, (_, i) => {
    const button = el('button', { textContent: String(i + 1) });
    if (here.book === order && here.chapter === i + 1) button.classList.add('current');
    button.addEventListener('click', async () => {
      await closeSheet(jump);
      jumpTo(bible.chapter(order, i + 1));
    });
    return button;
  }));
  requestAnimationFrame(() => grid.querySelector('.current')?.scrollIntoView({ block: 'center' }));
}

testaments.addEventListener('click', (e) => {
  const t = e.target.closest('[data-testament]')?.dataset.testament;
  if (t) { testament = t; renderBooks(); }
});
bookSearch.addEventListener('input', renderBooks);
jumpBack.addEventListener('click', showBooks);

document.getElementById('jumpButton').addEventListener('click', () => {
  bookSearch.value = '';
  const here = currentItem()?.verse ?? state.window[0];
  showChapters(here.book);
  jump.showModal();
});

// ---------- Start ----------

async function start() {
  const [data, opened] = await Promise.all([
    fetch('bsb.json').then((r) => r.json()),
    Journal.open(),
  ]);
  bible = new Bible(data.books);
  journal = opened;
  const begin = startFor(Number(localStorage.getItem(LAST_VERSE)));
  show(begin.window, begin.id);
  state.settledID = begin.id;
  document.getElementById('loading').remove();

  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.();
}

// Registered before start() so a broken version can still be replaced by the next one.
if ('serviceWorker' in navigator) {
  // A new version took over from an old one: reload once so the update shows now.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
  navigator.serviceWorker.register('sw.js');
}

start().catch((error) => {
  document.getElementById('loading').textContent = `Couldn't load: ${error?.message ?? error}`;
});
