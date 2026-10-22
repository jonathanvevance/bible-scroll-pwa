// Set once at start-up and shared by every screen. Each screen's own state lives in its module.

export const feed = document.getElementById('feed');
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const anySheetOpen = () => document.querySelector('dialog[open]') !== null;

export let bible;
export let journal;
const journalListeners = [];
/** Runs `refresh` after every change to the reflections or likes. */
export function onJournalChange(refresh) {
  journalListeners.push(refresh);
}
/** Called once at start-up, when the text and the journal are loaded. */
export function setData(loadedBible, openedJournal) {
  bible = loadedBible;
  journal = openedJournal;
  journal.addEventListener('change', () => { for (const refresh of journalListeners) refresh(); });
}
