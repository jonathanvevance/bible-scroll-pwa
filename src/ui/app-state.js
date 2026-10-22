// ---------- State ----------

/** The verse being read, kept so the app reopens there. */
export const LAST_VERSE = 'lastVerseKey';
export const feed = document.getElementById('feed');
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

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
export const state = {
  window: [],
  items: [],
  settledID: null,
  touching: false,
  settleTimer: 0,
  advanceTimer: 0,
  glideTop: null,
  glideTimer: 0,
};

// Pages can be a fractional height; clientHeight rounds, which drifts over long chapters.
export const pageHeight = () => feed.firstElementChild?.getBoundingClientRect().height || feed.clientHeight;
export const currentIndex = () => Math.round(feed.scrollTop / pageHeight());
export const currentItem = () => state.items[currentIndex()];
export const currentVerse = () => (currentItem()?.type === 'verse' ? currentItem().verse : null);
export const anySheetOpen = () => document.querySelector('dialog[open]') !== null;
