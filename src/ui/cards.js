import { dayName, timeOf } from '../core/dates.js';
import { unpackKey, verseName } from '../core/references.js';
import { bible } from './app-state.js';
import { el } from './dom.js';

// ---------- Verse cards, grouped by day (Reflections and Liked) ----------

/** A reflection shows its text under the verse; a like shows the verse alone, larger. */
function verseCard(entry) {
  const v = unpackKey(entry.verseKey);
  const reflection = 'body' in entry;
  const card = el('button', { className: 'reflection-card' },
    el('span', { className: 'reflection-top' },
      el('span', { textContent: v ? verseName(v) : '' }),
      el('span', { className: 'reflection-time', textContent: timeOf(entry) })),
    el('span', { className: reflection ? 'reflection-verse' : 'liked-verse', textContent: bible.text(entry.verseKey) ?? '' }),
    ...(reflection ? [el('span', { className: 'reflection-text', textContent: entry.body })] : []));
  card.dataset.key = entry.verseKey;
  return card;
}

/**
 * Appends `entries`, newest first, as cards under a heading for each day. Pass back what the last
 * call returned to carry on the same day's list when a list loads a page at a time.
 */
export function appendByDay(container, entries, last = null) {
  for (const entry of entries) {
    const name = dayName(entry.createdAt);
    if (name !== last?.name) {
      last = { name, list: el('ul', { className: 'reflection-cards' }) };
      container.append(el('section', { className: 'reflection-day' },
        el('h2', { className: 'section-label', textContent: name }), last.list));
    }
    last.list.append(el('li', {}, verseCard(entry)));
  }
  return last;
}
