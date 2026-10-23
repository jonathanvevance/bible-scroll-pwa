import { verseName } from '../core/references.js';
import { lang } from '../lang/current.js';
import { feed, journal } from './app-state.js';
import { toast } from './dom.js';
import { itemFor } from './feed.js';
// ---------- Verse actions ----------

/** Handlers for the buttons on each verse page, keyed by their data-action. */
const handlers = {};
/** `run(verse, button)` handles taps on the verse pages' `data-action="name"` buttons. */
export function onVerseAction(name, run) {
  handlers[name] = run;
}
feed.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const id = e.target.closest('.page').dataset.id;
  handlers[action](itemFor(id).verse, e.target.closest('[data-action]'));
});
/** Likes are the journal's 'favourite' marks, so favourites saved before keep showing. */
export const LIKE = 'favourite';
export function showLiked(button, liked) {
  button.setAttribute('aria-pressed', String(liked));
  button.setAttribute('aria-label', liked ? 'Unlike' : 'Like');
}
onVerseAction('like', async (v, button) => {
  if (button.dataset.busy) return;
  button.dataset.busy = '1';
  try {
    const liked = await journal.toggleMark(LIKE, v.key);
    button.classList.remove('pop');
    if (liked) {
      void button.offsetWidth; // restarts the animation
      button.classList.add('pop');
    }
  } finally {
    delete button.dataset.busy;
  }
});

export const verseQuote = (v) => `“${v.text}” (${verseName(v)}, ${lang.quoteName})`;

/** Opens the share sheet, or copies where there is none. `notify` must show above any open sheet. */
export async function shareText(text, copied, notify = toast) {
  if (navigator.share) {
    try { await navigator.share({ text }); } catch { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    notify(copied);
  } catch {
    notify("Couldn't share");
  }
}

onVerseAction('share', (v) => shareText(verseQuote(v), 'Verse copied'));
