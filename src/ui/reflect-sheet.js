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
    const share = el('button', { className: 'reflection-icon glass', ariaLabel: 'Share' });
    share.innerHTML = SHARE_ICON;
    share.addEventListener('click', () => {
      closeMenu();
      shareText(`${verseQuote(timelineVerse)}\n\n${c.body}`, 'Reflection copied', alert);
    });
    const more = el('button', { className: 'reflection-icon glass', ariaLabel: 'Edit or delete' });
    more.innerHTML = MORE_ICON;
    const meta = c.updatedAt ? `${stamp(c)} · Edited` : stamp(c);
    const row = el('li', { className: 'reflection-row' },
      el('div', { className: 'reflection-row-top' },
        el('p', { className: 'reflection-meta', textContent: meta }), share, more),
      el('p', { className: 'reflection-body', textContent: c.body }));
    more.addEventListener('click', () => (menuFor === c ? closeMenu() : openMenu(c, row)));
    return row;
  }));
}

// The ••• on a reflection opens a small menu with Edit and Delete under it. One open at a time.
const SHARE_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
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
  closeMenu();
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
