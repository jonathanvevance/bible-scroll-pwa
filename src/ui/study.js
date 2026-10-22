import { HUB_TOOLS, hubURL, verseName } from '../core/references.js';
import { onVerseAction } from './actions.js';
import { bible, journal } from './app-state.js';
import { el } from './dom.js';
import { closeSheet } from './sheets.js';

const study = document.getElementById('study');
const debug = location.hash.includes('debug');
document.getElementById('debugSection').hidden = !debug;

onVerseAction('study', (v) => {
  document.getElementById('studyTitle').textContent = verseName(v);
  document.getElementById('studyVerse').textContent = v.text;
  document.getElementById('studyLinks').replaceChildren(...HUB_TOOLS.map(([title, tool, icon]) => {
    const link = el('a', { href: hubURL(tool, v), target: '_blank', rel: 'noopener' });
    link.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    link.append(el('span', { textContent: title }));
    return el('li', {}, link);
  }));
  study.showModal();
});

document.getElementById('seedButton').addEventListener('click', async () => {
  const verses = bible.chapters.flatMap((ch) => bible.verses(ch)).filter((v) => v.text);
  const now = Date.now();
  const entries = Array.from({ length: 500 }, (_, i) => ({
    verseKey: verses[Math.floor(Math.random() * verses.length)].key,
    body: `Seeded reflection #${i + 1}.`,
    createdAt: now - Math.floor(Math.random() * 90 * 86_400_000),
  }));
  await journal.addMany(entries);
  closeSheet(study);
});

document.getElementById('wipeButton').addEventListener('click', async () => {
  if (!confirm('Delete every reflection?')) return;
  await journal.deleteAll();
  closeSheet(study);
});
