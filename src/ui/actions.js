import { verseName } from '../core/references.js';
import { feed, journal, state } from './app-state.js';
import { toast } from './dom.js';
import { guardPresses } from './pressable.js';

// ---------- Verse actions ----------

/** Handlers for the buttons on each verse page, keyed by their data-action. */
export const verseActions = {};
feed.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const id = e.target.closest('.page').dataset.id;
  verseActions[action](state.items.find((i) => i.id === id).verse, e.target.closest('[data-action]'));
});

// As with any iOS button, a press that slides off (or begins by stopping the feed) does nothing.
guardPresses(feed, { group: (target) => target.closest('.actions'), scrollers: [feed] });

/** Likes are the journal's 'favourite' marks, so favourites saved before keep showing. */
export const LIKE = 'favourite';
export function showLiked(button, liked) {
  button.setAttribute('aria-pressed', String(liked));
  button.setAttribute('aria-label', liked ? 'Unlike' : 'Like');
}
verseActions.like = async (v, button) => {
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
};

export const verseQuote = (v) => `“${v.text}” (${verseName(v)}, BSB)`;

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

verseActions.share = (v) => shareText(verseQuote(v), 'Verse copied');
