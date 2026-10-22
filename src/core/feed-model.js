// The feed model (mirrors BibleCore's ChapterFeed). No DOM, so tests can import it.
// The feed shows a window of chapters bracketed by boundary pages: the chapter being
// read plus one either side, so a boundary is never a dead end and the reader can
// swipe straight through it. Settling on a verse in another chapter recentres the
// window. A boundary's id is the same in every window that contains it.

import { unpackKey } from './references.js';

const boundary = (before, after) => ({ type: 'boundary', id: `b${before?.key ?? 0}-${after?.key ?? 0}`, before, after });
const verseItem = (verse) => ({ type: 'verse', id: `v${verse.key}`, verse });

export function itemsFor(bible, window) {
  const items = [boundary(bible.before(window[0]), window[0])];
  for (const ch of window) {
    for (const v of bible.verses(ch)) if (v.text) items.push(verseItem(v));
    items.push(boundary(ch, bible.after(ch)));
  }
  return items;
}

const windowAround = (bible, ch) => [bible.before(ch), ch, bible.after(ch)].filter(Boolean);

/** The window to show after settling on `item`, or null when `current` already fits. */
export function windowAfterSettling(bible, item, current) {
  if (item.type !== 'verse') return null;
  const next = windowAround(bible, bible.chapter(item.verse.book, item.verse.chapter));
  const same = next.length === current.length && next.every((ch, i) => ch.key === current[i].key);
  return same ? null : next;
}

/** Saved verse -> its chapter and page; unknown keys fall back to Genesis 1:1. */
export function startFor(bible, key) {
  const ref = unpackKey(key);
  const chapter = (ref && bible.chapter(ref.book, ref.chapter)) ?? bible.chapters[0];
  const verses = itemsFor(bible, [chapter]).filter((i) => i.type === 'verse');
  const page = verses.find((i) => i.verse.key === key) ?? verses[0];
  return { window: windowAround(bible, chapter), id: page.id };
}

/**
 * Where to carry on after resting on a boundary: forward to the next chapter's first
 * verse, or back to the previous chapter's last verse, depending on which side the
 * reader came from. End caps never advance. `items` are the feed's current pages.
 */
export function advanceTarget(item, previousID, items) {
  if (item.type !== 'boundary' || !item.before || !item.after) return null;
  if (!previousID?.startsWith('v')) return null;
  const forward = Number(previousID.slice(1)) < item.after.key;
  const verses = items.filter((i) => i.type === 'verse');
  const target = forward
    ? verses.find((i) => i.verse.book === item.after.book && i.verse.chapter === item.after.chapter)
    : verses.findLast((i) => i.verse.book === item.before.book && i.verse.chapter === item.before.chapter);
  return target?.id ?? null;
}
