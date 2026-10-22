import { LIKE } from './actions.js';
import { journal, reduceMotion } from './app-state.js';
import { appendByDay } from './cards.js';
import { goToVerse } from './feed.js';
import { rememberPlace } from './history.js';
import { currentTab, likedView, registerTab, showTab } from './tabs.js';

// ---------- Liked tab ----------

const likedList = document.getElementById('likedList');
const likedEmpty = document.getElementById('likedEmpty');

/** Newest first, under a heading for the day each verse was liked, like Reflections. */
export async function renderLiked() {
  if (!journal) return;
  const marks = await journal.marks(LIKE);
  if (currentTab() !== 'liked') return;
  likedList.replaceChildren();
  appendByDay(likedList, marks);
  likedEmpty.hidden = marks.length > 0;
  likedView.scrollTop = 0;
}
registerTab('liked', renderLiked);

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
