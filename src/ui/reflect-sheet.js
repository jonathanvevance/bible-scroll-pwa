import { verseName } from '../core/references.js';
import { onVerseAction, shareText, verseQuote } from './actions.js';
import { journal } from './app-state.js';
import { el } from './dom.js';
import { settle } from './feed.js';
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
  closeMenu();
  document.getElementById('timelineList').replaceChildren(...comments.map((c) => {
    const more = el('button', { className: 'reflection-icon', ariaLabel: 'Edit, share or delete' });
    more.innerHTML = MORE_ICON;
    const meta = c.updatedAt ? `${stamp(c)} · Edited` : stamp(c);
    const row = el('li', { className: 'reflection-row' },
      el('div', { className: 'reflection-row-top' },
        el('p', { className: 'reflection-meta', textContent: meta }), more),
      el('p', { className: 'reflection-body', textContent: c.body }));
    more.addEventListener('click', () => (menuFor === c ? closeMenu() : openMenu(c, row)));
    return row;
  }));
}

// The ••• on a reflection opens a small menu with Edit, Share and Delete under it. One open at a time.
const MORE_ICON = '<svg viewBox="0 0 24 24" class="filled"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg>';
const reflectionMenu = document.getElementById('reflectionMenu');
let menuFor = null;

function openMenu(comment, row) {
  menuFor = comment;
  row.append(reflectionMenu);
  reflectionMenu.hidden = false;
}

function closeMenu() {
  menuFor = null;
  reflectionMenu.hidden = true;
}

document.getElementById('menuEdit').addEventListener('click', () => startEditing(menuFor));
document.getElementById('menuShare').addEventListener('click', () => {
  const c = menuFor;
  closeMenu();
  if (c) shareText(`${verseQuote(timelineVerse)}\n\n${c.body}`, 'Reflection copied', alert);
});
document.getElementById('menuDelete').addEventListener('click', async () => {
  const c = menuFor;
  closeMenu();
  if (!c || !confirm('Delete this reflection?')) return;
  await journal.delete(c);
  // Otherwise Done would save the deleted reflection's text back.
  if (editing?.id === c.id) setEditing(null);
  renderTimeline();
});

// A touch anywhere else in the sheet, or a scroll, closes the menu.
timeline.addEventListener('touchstart', (e) => {
  if (menuFor && !e.target.closest('#reflectionMenu, .reflection-icon')) closeMenu();
}, { passive: true });
timelineBody.addEventListener('scroll', () => { if (menuFor) closeMenu(); }, { passive: true });
timeline.addEventListener('close', closeMenu);

/** The reflection being edited in the writing area, or null when writing a new one. */
let editing = null;
/**
 * The text before an edit chosen from •••, while Cancel and Save replace Done. A new reflection
 * saved on the way to the background becomes `editing` too, but keeps Done.
 */
let editedFrom = null;
const composerLabel = document.getElementById('composerLabel');
const composerHint = document.getElementById('composerHint');
const cancelEdit = document.getElementById('cancelEdit');
const saveEdit = document.getElementById('saveEdit');
const doneButton = timeline.querySelector('[data-close]');

function setEditing(comment) {
  editing = comment;
  if (!comment) editedFrom = null;
  const day = editedFrom != null && new Date(comment.createdAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  composerLabel.textContent = day ? `Editing your reflection from ${day}` : 'New reflection';
  composerHint.hidden = editedFrom != null;
  cancelEdit.hidden = saveEdit.hidden = editedFrom == null;
  doneButton.hidden = editedFrom != null;
  composerText.value = comment?.body ?? '';
  sizeComposer();
}

function startEditing(comment) {
  closeMenu();
  // What's in the box, a new reflection or changes to another, is saved rather than replaced.
  // Not awaited, so the keyboard can still open from this tap.
  const body = composerText.value.trim();
  const saving = !editing ? (body ? journal.add(body, timelineVerse.key) : null)
    : body && body !== editing.body ? journal.update(editing, body) : null;
  saving?.then(renderTimeline)
    .catch((error) => alert(`Couldn't save: ${error?.message ?? error}`));
  editedFrom = comment.body;
  setEditing(comment);
  composerText.focus();
}

/** Leaves an edit, back to an empty box for a new reflection and Done in the corner. */
function endEdit() {
  setEditing(null);
  composerText.blur();
  renderTimeline();
}

cancelEdit.addEventListener('click', async () => {
  const original = editedFrom;
  if (composerText.value.trim() !== original && !confirm('Discard changes?')) return;
  try {
    // Leaving the app mid-edit saved the changes; put the original back.
    if (editing.body !== original) await journal.update(editing, original);
  } catch (error) {
    alert(`Couldn't undo: ${error?.message ?? error}`);
  }
  endEdit();
});

saveEdit.addEventListener('click', async () => {
  const body = composerText.value.trim();
  try {
    if (body && body !== editing.body) await journal.update(editing, body);
  } catch (error) {
    return alert(`Couldn't save: ${error?.message ?? error}`);
  }
  endEdit();
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

// With the keyboard up, iOS can pan the whole screen, sheet and all. A drag in the writing box
// that the box can't scroll itself (it's short, or already at that end) would do that, so it's
// stopped. Not passive, but only the box listens, and only while writing.
let dragY = 0;
composerText.addEventListener('touchstart', (e) => { dragY = e.touches[0].clientY; }, { passive: true });
composerText.addEventListener('touchmove', (e) => {
  if (!document.documentElement.classList.contains('writing') || !e.cancelable) return;
  const y = e.touches[0].clientY;
  const down = y > dragY;
  dragY = y;
  const { scrollTop, scrollHeight, clientHeight } = composerText;
  if (down ? scrollTop <= 0 : scrollTop + clientHeight >= scrollHeight - 1) e.preventDefault();
}, { passive: false });

// Study (Bible Hub)
