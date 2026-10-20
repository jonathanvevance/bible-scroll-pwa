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

const HUB_TOOLS = [
  ['Compare translations', (s, c, v) => `parallel/${s}/${c}-${v}.htm`],
  ['Read chapter context', (s, c) => `${s}/${c}.htm`],
  ['Cross-references', (s, c, v) => `crossref/${s}/${c}-${v}.htm`],
  ['Commentaries', (s, c, v) => `commentaries/${s}/${c}-${v}.htm`],
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
const controls = document.querySelector('.controls');
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

const BUBBLE = '<svg viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 5h8v1.5H8Zm0 3.5h5V14H8Z"/></svg>';

function badge(count) {
  const node = el('span', { className: 'badge', hidden: count === 0 });
  node.innerHTML = BUBBLE;
  node.append(String(count));
  return node;
}

function page(item) {
  const node = el('section', { className: `page ${item.type}` });
  node.dataset.id = item.id;
  if (item.type === 'verse') {
    const v = item.verse;
    node.append(el('div', { className: 'verse-body' },
      el('div', { className: 'reference' }, el('span', { textContent: verseName(v) }), badge(journal.count(v.key))),
      el('p', { className: 'verse-text', textContent: v.text })));
  } else {
    node.append(el('div', { className: 'boundary-body' },
      item.before ? el('p', { className: 'end-of', textContent: `End of ${chapterName(item.before)}` }) : null,
      el('h1', { className: 'chapter-title', textContent: item.after ? chapterName(item.after) : 'The end' })));
  }
  return node;
}

function refreshBadge(verseKey) {
  const old = feed.querySelector(`[data-id="v${verseKey}"] .badge`);
  old?.replaceWith(badge(journal.count(verseKey)));
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

function updateControls() {
  controls.classList.toggle('reading-boundary', !currentVerse());
}

// ---------- Settling and auto-advance ----------

function settle() {
  if (state.touching) return;
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
    const index = state.items.findIndex((i) => i.id === target);
    feed.scrollTo({ top: index * pageHeight(), behavior: reduceMotion.matches ? 'instant' : 'smooth' });
  }, ADVANCE_DELAY_MS);
}

function settleSoon() {
  clearTimeout(state.settleTimer);
  state.settleTimer = setTimeout(settle, SETTLE_DELAY_MS);
}

feed.addEventListener('scroll', () => { updateControls(); settleSoon(); }, { passive: true });
feed.addEventListener('scrollend', () => { clearTimeout(state.settleTimer); settle(); });
feed.addEventListener('touchstart', () => {
  state.touching = true;
  clearTimeout(state.advanceTimer);
}, { passive: true });
for (const type of ['touchend', 'touchcancel']) {
  feed.addEventListener(type, () => { state.touching = false; settleSoon(); }, { passive: true });
}

addEventListener('resize', () => {
  const index = state.items.findIndex((i) => i.id === state.settledID);
  if (index >= 0) feed.scrollTop = index * pageHeight();
});

function jumpTo(chapter) {
  const { window, id } = startFor(chapter.key + 1);
  clearTimeout(state.advanceTimer);
  show(window, id);
  state.settledID = id;
  localStorage.setItem(LAST_VERSE, id.slice(1));
}

// ---------- Sheets ----------

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => clearTimeout(state.advanceTimer));
}

// Keep sheets above the keyboard: the layout viewport does not shrink when it opens.
function trackKeyboard() {
  const vv = visualViewport;
  const keyboard = Math.max(0, innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty('--keyboard', `${keyboard}px`);
  document.documentElement.style.setProperty('--viewport-height', `${vv.height}px`);
  document.documentElement.classList.toggle('keyboard-up', keyboard > 80);
}
visualViewport?.addEventListener('resize', trackKeyboard);
visualViewport?.addEventListener('scroll', trackKeyboard);

// Reflections timeline

const timeline = document.getElementById('timeline');
const composerText = document.getElementById('composerText');
const composerSend = document.getElementById('composerSend');
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

async function renderTimeline() {
  const v = timelineVerse;
  const comments = await journal.comments(v.key);
  document.getElementById('timelineTitle').textContent = verseName(v);
  document.getElementById('timelineVerse').textContent = v.text;
  document.getElementById('timelineCount').textContent =
    comments.length === 0 ? '' : comments.length === 1 ? '1 reflection' : `${comments.length} reflections`;
  const list = document.getElementById('timelineList');
  if (comments.length === 0) {
    list.replaceChildren(el('li', { className: 'empty-note', textContent: 'Nothing written yet. What does this verse say to you today?' }));
    return;
  }
  list.replaceChildren(...comments.map((c) => {
    const del = el('button', { className: 'delete', textContent: 'Delete' });
    del.addEventListener('click', async () => {
      if (!confirm('Delete this reflection?')) return;
      await journal.delete(c);
      refreshBadge(c.verseKey);
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
  composerSend.disabled = !composerText.value.trim();
}
composerText.addEventListener('input', sizeComposer);

document.getElementById('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const added = await journal.add(composerText.value, timelineVerse.key);
    if (!added) return;
    composerText.value = '';
    sizeComposer();
    refreshBadge(timelineVerse.key);
    renderTimeline();
  } catch (error) {
    alert(`Couldn't save: ${error?.message ?? error}`);
  }
});

document.getElementById('reflectButton').addEventListener('click', () => {
  timelineVerse = currentVerse();
  if (!timelineVerse) return;
  renderTimeline();
  timeline.showModal();
});

// Study (Bible Hub)

const study = document.getElementById('study');
const debug = location.hash.includes('debug');
document.getElementById('debugSection').hidden = !debug;

document.getElementById('studyButton').addEventListener('click', () => {
  const v = currentVerse();
  if (!v) return;
  document.getElementById('studyTitle').textContent = verseName(v);
  document.getElementById('studyLinks').replaceChildren(...HUB_TOOLS.map(([title, tool]) =>
    el('li', {}, el('a', { href: hubURL(tool, v), target: '_blank', rel: 'noopener', textContent: title }))));
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
  for (const e of entries) refreshBadge(e.verseKey);
  study.close();
});

document.getElementById('wipeButton').addEventListener('click', async () => {
  if (!confirm('Delete every reflection?')) return;
  const keys = [...journal.counts.keys()];
  await journal.deleteAll();
  for (const k of keys) refreshBadge(k);
  study.close();
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
    button.addEventListener('click', () => showChapters(b.order));
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
    button.addEventListener('click', () => {
      jump.close();
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
  if ('serviceWorker' in navigator) {
    // A new version took over from an old one: reload once so the update shows now.
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) location.reload(); });
    navigator.serviceWorker.register('sw.js');
  }
}

start().catch((error) => {
  document.getElementById('loading').textContent = `Couldn't load: ${error?.message ?? error}`;
});
