import { verseName } from '../core/references.js';
import { onVerseAction, shareText, verseQuote } from './actions.js';
import { journal } from './app-state.js';
import { el } from './dom.js';
import { settle } from './feed.js';
import { DRAG_PX } from './haptics.js';
import { openSheet, trackKeyboard } from './sheets.js';

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
  openRow = null;
  document.getElementById('timelineList').replaceChildren(...comments.map((c) => {
    const share = el('button', { className: 'swipe-share', textContent: 'Share' });
    share.addEventListener('click', () => {
      closeOpenRow();
      shareText(`${verseQuote(timelineVerse)}\n\n${c.body}`, 'Reflection copied', alert);
    });
    const edit = el('button', { className: 'swipe-edit', textContent: 'Edit' });
    edit.addEventListener('click', () => startEditing(c));
    const del = el('button', { className: 'swipe-delete', textContent: 'Delete' });
    del.addEventListener('click', async () => {
      if (!confirm('Delete this reflection?')) return closeOpenRow();
      await journal.delete(c);
      // Otherwise Done would save the deleted reflection's text back.
      if (editing?.id === c.id) setEditing(null);
      renderTimeline();
    });
    const meta = c.updatedAt ? `${stamp(c)} · Edited` : stamp(c);
    const row = el('li', { className: 'swipe-row' },
      el('div', { className: 'swipe-actions' }, edit, share, del),
      el('div', { className: 'swipe-content' },
        el('p', { className: 'reflection-meta', textContent: meta }),
        el('p', { className: 'reflection-body', textContent: c.body })));
    makeSwipeable(row);
    return row;
  }));
}

// Swiping a reflection left reveals Edit, Share and Delete behind it, as in Mail. One row open at a time.
const SWIPE_ACTIONS_WIDTH = 240;
let openRow = null;

function closeOpenRow() {
  openRow?.querySelector('.swipe-content').style.removeProperty('transform');
  openRow = null;
}

function makeSwipeable(row) {
  const content = row.querySelector('.swipe-content');
  let startX, startY, base, x, mode;
  row.addEventListener('touchstart', (e) => {
    if (e.target.closest('.swipe-actions')) return;
    if (openRow && openRow !== row) closeOpenRow();
    ({ clientX: startX, clientY: startY } = e.touches[0]);
    base = openRow === row ? -SWIPE_ACTIONS_WIDTH : 0;
    x = base;
    mode = null;
  }, { passive: true });
  row.addEventListener('touchmove', (e) => {
    if (mode === undefined || mode === 'scroll') return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!mode) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll';
      if (mode === 'scroll') return;
      row.classList.add('dragging');
    }
    e.preventDefault();
    x = Math.min(0, base + dx);
    // Past the buttons the row resists, like a rubber band.
    if (x < -SWIPE_ACTIONS_WIDTH) x = -SWIPE_ACTIONS_WIDTH + (x + SWIPE_ACTIONS_WIDTH) / 3;
    content.style.transform = `translateX(${x}px)`;
  }, { passive: false });
  const settle = () => {
    if (mode !== 'swipe') return;
    mode = undefined;
    row.classList.remove('dragging');
    if (x < -SWIPE_ACTIONS_WIDTH / 2) {
      content.style.transform = `translateX(${-SWIPE_ACTIONS_WIDTH}px)`;
      openRow = row;
    } else {
      content.style.removeProperty('transform');
      if (openRow === row) openRow = null;
    }
  };
  row.addEventListener('touchend', settle);
  row.addEventListener('touchcancel', settle);
  content.addEventListener('click', closeOpenRow);
}

// A touch anywhere else in the sheet closes an open row.
timeline.addEventListener('touchstart', (e) => {
  if (openRow && !openRow.contains(e.target)) closeOpenRow();
}, { passive: true });

/** The reflection being edited in the writing area, or null when writing a new one. */
let editing = null;
const composerLabel = document.getElementById('composerLabel');
const composerHint = document.getElementById('composerHint');
const cancelEdit = document.getElementById('cancelEdit');

function setEditing(comment) {
  editing = comment;
  composerLabel.textContent = comment ? 'Edit reflection' : 'New reflection';
  composerHint.hidden = !!comment;
  cancelEdit.hidden = !comment;
  composerText.value = comment?.body ?? '';
  sizeComposer();
}

function startEditing(comment) {
  closeOpenRow();
  // What's in the box, a new reflection or changes to another, is saved rather than replaced.
  // Not awaited, so the keyboard can still open from this tap.
  const body = composerText.value.trim();
  const saving = !editing ? (body ? journal.add(body, timelineVerse.key) : null)
    : body && body !== editing.body ? journal.update(editing, body) : null;
  saving?.then(renderTimeline)
    .catch((error) => alert(`Couldn't save: ${error?.message ?? error}`));
  setEditing(comment);
  composerText.focus();
}

cancelEdit.addEventListener('click', () => {
  setEditing(null);
  composerText.blur();
});

function sizeComposer() {
  composerText.style.height = 'auto';
  composerText.style.height = `${composerText.scrollHeight}px`;
}
composerText.addEventListener('input', sizeComposer);

/**
 * Saves whatever is in the writing area: as a new reflection, or as the new text of the one
 * being edited. Emptying an edit keeps the original; deleting is a separate choice.
 */
async function saveDraft() {
  const body = composerText.value.trim();
  const edited = editing;
  if (!timelineVerse || (!body && !edited)) return;
  try {
    if (!edited) await journal.add(body, timelineVerse.key);
    else if (body && body !== edited.body) await journal.update(edited, body);
    setEditing(null);
    await renderTimeline();
    scrollTimelineToEnd();
  } catch (error) {
    alert(`Couldn't save: ${error?.message ?? error}`);
  }
}

// Done or a tap outside closes the sheet; neither loses the text.
timeline.addEventListener('close', saveDraft);

/**
 * iOS may close the app while it's in the background, so leaving it saves the text without
 * closing the box: a new reflection becomes the one being edited.
 */
async function keepDraft() {
  const body = composerText.value.trim();
  if (!timeline.open || !timelineVerse || !body || body === editing?.body) return;
  try {
    const saved = editing ? await journal.update(editing, body) : await journal.add(body, timelineVerse.key);
    const text = composerText.value; // anything typed since stays
    setEditing(saved);
    composerText.value = text;
    sizeComposer();
    renderTimeline();
  } catch (error) {
    alert(`Couldn't save: ${error?.message ?? error}`);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') keepDraft();
});

onVerseAction('reflect', (v) => {
  timelineVerse = v;
  document.getElementById('timelineTitle').textContent = verseName(timelineVerse);
  document.getElementById('timelineVerse').textContent = timelineVerse.text;
  document.getElementById('timelineCount').textContent = '';
  document.getElementById('timelineList').replaceChildren();
  setEditing(null);
  openSheet(timeline);
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
