import { unpackKey, verseName } from '../core/references.js';
import { LIKE } from './actions.js';
import { bible, journal, reduceMotion } from './app-state.js';
import { el } from './dom.js';
import { goToVerse } from './feed.js';
import { rememberPlace } from './history.js';
import { dayName, timeOf } from './reflections.js';
import { likedView, showTab, tab } from './tabs.js';

// ---------- Liked tab ----------

const likedList = document.getElementById('likedList');
const likedEmpty = document.getElementById('likedEmpty');

function likedCard(mark) {
  const v = unpackKey(mark.verseKey);
  const card = el('button', { className: 'reflection-card' },
    el('span', { className: 'reflection-top' },
      el('span', { textContent: v ? verseName(v) : '' }),
      el('span', { className: 'reflection-time', textContent: timeOf(mark) })),
    el('span', { className: 'liked-verse', textContent: v ? bible.books[v.book - 1]?.[v.chapter - 1]?.[v.verse - 1] ?? '' : '' }));
  card.dataset.key = mark.verseKey;
  return card;
}

/** Newest first, under a heading for the day each verse was liked, like Reflections. */
export async function renderLiked() {
  if (!journal) return;
  const marks = await journal.marks(LIKE);
  if (tab !== 'liked') return;
  const days = [];
  for (const mark of marks) {
    const name = dayName(mark.createdAt);
    if (days.at(-1)?.name !== name) days.push({ name, list: el('ul', { className: 'reflection-cards' }) });
    days.at(-1).list.append(el('li', {}, likedCard(mark)));
  }
  likedList.replaceChildren(...days.map(({ name, list }) => el('section', { className: 'reflection-day' },
    el('h2', { className: 'section-label', textContent: name }), list)));
  likedEmpty.hidden = marks.length > 0;
  likedView.scrollTop = 0;
}

/** A tap on a card in Liked or Reflections opens its verse in the Bible tab. */
export function openCard(e) {
  const key = Number(e.target.closest('.reflection-card')?.dataset.key);
  if (!key) return;
  rememberPlace();
  const go = () => { showTab('bible'); goToVerse(key); };
  if (reduceMotion.matches || !document.startViewTransition) go();
  else document.startViewTransition(go);
}
likedList.addEventListener('click', openCard);
