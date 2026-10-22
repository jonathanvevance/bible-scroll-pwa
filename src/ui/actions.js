import { verseName } from '../core/references.js';
import { feed, journal, state } from './app-state.js';
import { toast } from './dom.js';
import { updateActions } from './feed.js';
import { DRAG_PX } from './haptics.js';

// ---------- Verse actions ----------

/** Handlers for the buttons on each verse page, keyed by their data-action. */
export const verseActions = {};
feed.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const id = e.target.closest('.page').dataset.id;
  verseActions[action](state.items.find((i) => i.id === id).verse, e.target.closest('[data-action]'));
});

// As with any iOS button, a press that slides off does nothing: once the finger moves (or iOS
// takes the touch over), the column's haptic switches, which would toggle on release, are
// disabled and the click that follows is swallowed.
let actionTouch = null;
function setActionSwitches(column, on) {
  for (const input of column.querySelectorAll('.haptic')) input.disabled = !on;
}
function resetActionTouch() {
  if (!actionTouch) return;
  actionTouch.column.classList.remove('dragged');
  setActionSwitches(actionTouch.column, true);
  actionTouch = null;
}
function cancelActionTouch() {
  if (!actionTouch || actionTouch.moved) return;
  actionTouch.moved = true;
  actionTouch.column.classList.add('dragged');
  setActionSwitches(actionTouch.column, false);
}
feed.addEventListener('touchstart', (e) => {
  if (actionTouch?.moved) resetActionTouch();
  const column = e.target.closest('.actions');
  actionTouch = column ? { column, x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false } : null;
}, { passive: true });
feed.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (actionTouch && Math.hypot(t.clientX - actionTouch.x, t.clientY - actionTouch.y) > DRAG_PX) cancelActionTouch();
}, { passive: true });
feed.addEventListener('touchend', () => {
  const ended = actionTouch;
  if (ended?.moved) setTimeout(() => { if (actionTouch === ended) resetActionTouch(); }, 400);
}, { passive: true });
// The finger may stay down long after a cancel, unseen, so the switches stay off until the next touch.
feed.addEventListener('touchcancel', cancelActionTouch, { passive: true });
feed.addEventListener('click', (e) => {
  if (!actionTouch?.moved || !e.target.closest('.actions')) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

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
    updateActions();
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
