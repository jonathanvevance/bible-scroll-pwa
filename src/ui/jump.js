import { BOOKS } from '../../books.js';
import { bookInfo, parseReference, squash, verseName } from '../core/references.js';
import { bible, currentItem, state } from './app-state.js';
import { el } from './dom.js';
import { jumpTo } from './feed.js';
import { withHaptic } from './haptics.js';
import { guardPresses } from './pressable.js';
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

// Only a real tap opens a book or chapter: not a slide, a scroll of the list during the touch,
// or a touch that stops a gliding list.
guardPresses(jump, { scrollers: [bookView, chapterView] });
