import { feed, onJournalChange } from './app-state.js';
import { pauseFeed } from './feed.js';
import { rail } from './rail.js';

// ---------- Tabs ----------

const tabBar = document.getElementById('tabBar');
export const reflectionsView = document.getElementById('reflectionsView');
export const likedView = document.getElementById('likedView');
const tabViews = { reflections: reflectionsView, liked: likedView };
const bibleView = [feed, rail, document.querySelector('.topbar')];
let tab = 'bible';
export function currentTab() {
  return tab;
}
const renders = {};

/** `render` fills tab `name` each time it is shown, and again when the journal changes under it. */
export function registerTab(name, render) {
  renders[name] = render;
}
onJournalChange(() => renders[tab]?.());

/** The Bible view is only hidden, never removed, so the feed keeps its place. */
export function showTab(name) {
  if (name === tab) return;
  tab = name;
  const reading = name === 'bible';
  document.documentElement.classList.toggle('tab-away', !reading);
  for (const button of tabBar.querySelectorAll('[data-tab]')) {
    const selected = button.dataset.tab === name;
    button.classList.toggle('selected', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  for (const node of bibleView) node.inert = !reading;
  for (const [key, view] of Object.entries(tabViews)) view.hidden = key !== name;
  if (!reading) pauseFeed();
  renders[name]?.();
}

tabBar.addEventListener('click', (e) => {
  const name = e.target.closest('[data-tab]')?.dataset.tab;
  if (name) showTab(name);
});
