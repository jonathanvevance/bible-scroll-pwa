import { BOOKS } from '../../books.js';
import { bookInfo, parseReference, squash, verseName } from '../core/references.js';
import { bible, currentItem, state } from './app-state.js';
import { el } from './dom.js';
import { jumpTo } from './feed.js';
import { DRAG_PX, withHaptic } from './haptics.js';
import { closeSheet, slideIn } from './sheets.js';

// Jump to

const jump = document.getElementById('jump');
const bookView = document.getElementById('bookView');
const chapterView = document.getElementById('chapterView');
const jumpBack = document.getElementById('jumpBack');
const jumpTitle = document.getElementById('jumpTitle');
const bookSearch = document.getElementById('bookSearch');
const testaments = document.getElementById('testaments');
let testament = 'old';

async function goToReference(verse) {
  await closeSheet(jump);
  jumpTo(verse.key);
}

function renderBooks() {
  const query = squash(bookSearch.value);
  testaments.hidden = query !== '';
  readingSection.hidden = query !== '';
  for (const b of testaments.children) b.classList.toggle('selected', b.dataset.testament === testament);
  const books = query
    ? BOOKS.filter((b) => [b.name, b.bsbName, b.usfm].some((n) => squash(n).includes(query)))
    : BOOKS.filter((b) => (b.order <= 39) === (testament === 'old'));
  const verse = query ? parseReference(bookSearch.value, bible) : null;
  const goTo = verse && withHaptic(el('button', { className: 'go-to', textContent: `Go to ${verseName(verse)}` }));
  goTo?.addEventListener('click', () => goToReference(verse));
  document.getElementById('bookList').replaceChildren(...(goTo ? [el('li', {}, goTo)] : []), ...books.map((b) => {
    const button = withHaptic(el('button', { className: 'chevron', ariaLabel: `${b.name}, ${b.chapters} chapters` },
      el('span', { className: 'book-name', textContent: b.name }),
      el('span', { className: 'chapter-count', textContent: String(b.chapters) })));
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
    const button = withHaptic(el('button', { textContent: String(i + 1) }));
    if (here.book === order && here.chapter === i + 1) button.classList.add('current');
    button.addEventListener('click', async () => {
      await closeSheet(jump);
      jumpTo(bible.chapter(order, i + 1).key + 1);
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
bookSearch.addEventListener('keydown', (e) => {
  const verse = e.key === 'Enter' && parseReference(bookSearch.value, bible);
  if (verse) goToReference(verse);
});
jumpBack.addEventListener('click', showBooks);

// Opens on the books, since swiping already moves between nearby chapters. The book being read
// sits at the top, one tap from its chapters.
const readingSection = document.getElementById('reading');
document.getElementById('jumpButton').addEventListener('click', () => {
  bookSearch.value = '';
  const here = currentItem()?.verse ?? state.window[0];
  testament = here.book <= 39 ? 'old' : 'new';
  document.getElementById('readingBook').textContent = bookInfo(here.book).name;
  document.getElementById('readingChapter').textContent = `Reading · Ch ${here.chapter}`;
  showBooks();
  jump.showModal();
  bookView.scrollTop = 0;
});
document.getElementById('readingButton').addEventListener('click', () => {
  showChapters((currentItem()?.verse ?? state.window[0]).book);
  slideIn(chapterView, 40);
});

// In the Jump sheet only a real tap opens a book or chapter: the finger stays put, the list does
// not scroll during the touch, and the touch did not begin by stopping a gliding list. Any other
// click, like the one iOS can send when a scroll ends on a row, is swallowed. The haptic switches
// are disabled for anything but a tap, since a native switch would otherwise toggle on release.
const PRESSABLE = '#readingButton, #bookList button, #chapterGrid button';
let touch = null;
let tapUntil = 0; // a real tap's click arrives just after its touchend, before this time
let lastJumpScroll = 0;
let switchesTimer = 0;
for (const scroller of [bookView, chapterView]) {
  scroller.addEventListener('scroll', () => {
    lastJumpScroll = performance.now();
    if (touch) touch.scrolled = true;
  }, { passive: true });
}

function setSwitchesEnabled(on) {
  for (const input of jump.querySelectorAll('.haptic')) input.disabled = !on;
}
function disableSwitchesForAMoment() {
  setSwitchesEnabled(false);
  clearTimeout(switchesTimer);
  switchesTimer = setTimeout(() => setSwitchesEnabled(true), 600);
}

jump.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, moved: false, scrolled: performance.now() - lastJumpScroll < 150 };
  tapUntil = 0;
  if (touch.scrolled) disableSwitchesForAMoment();
}, { passive: true });
jump.addEventListener('touchmove', (e) => {
  if (!touch || touch.moved) return;
  const t = e.touches[0];
  if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > DRAG_PX) {
    touch.moved = true;
    disableSwitchesForAMoment();
  }
}, { passive: true });
for (const type of ['touchend', 'touchcancel']) {
  jump.addEventListener(type, () => {
    const tap = type === 'touchend' && touch && !touch.moved && !touch.scrolled;
    tapUntil = tap ? performance.now() + 600 : 0;
    if (!tap) disableSwitchesForAMoment();
  }, { passive: true });
}
jump.addEventListener('click', (e) => {
  if (!e.target.closest(PRESSABLE)) return;
  // `touch` is null only for mouse or keyboard clicks, which always count.
  if (touch && performance.now() > tapUntil) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
