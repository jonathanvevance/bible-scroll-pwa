// References: the same packed key as the iOS app (book*1e6 + chapter*1e3 + verse), names, and
// links to Bible Hub. No DOM, so tests can import it.

import { BOOKS } from '../../books.js';

export const packKey = (book, chapter, verse = 0) => book * 1_000_000 + chapter * 1_000 + verse;
export const bookInfo = (order) => BOOKS[order - 1];
export const chapterName = (ch) => `${bookInfo(ch.book).bsbName} ${ch.chapter}`;
export const verseName = (v) => `${bookInfo(v.book).bsbName} ${v.chapter}:${v.verse}`;

export function unpackKey(key) {
  const book = Math.floor(key / 1_000_000);
  const chapter = Math.floor((key % 1_000_000) / 1_000);
  const verse = key % 1_000;
  if (!bookInfo(book) || chapter < 1 || verse < 1) return null;
  return { book, chapter, verse };
}

/** [title, Bible Hub path, SVG icon paths (24×24, stroked)] */
export const HUB_TOOLS = [
  ['Compare translations', (s, c, v) => `parallel/${s}/${c}-${v}.htm`,
    '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>'],
  ['Read chapter context', (s, c) => `${s}/${c}.htm`,
    '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>'],
  ['Cross-references', (s, c, v) => `crossref/${s}/${c}-${v}.htm`,
    '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'],
  ['Commentaries', (s, c, v) => `commentaries/${s}/${c}-${v}.htm`,
    '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h7"/>'],
];
export const hubURL = (tool, v) => `https://biblehub.com/${tool(bookInfo(v.book).slug, v.chapter, v.verse)}`;

export const squash = (s) => s.toLowerCase().replaceAll(' ', '');

/** "John 1:10", "1 cor 13 4", "ps23", "gen 1:" -> that verse (or the chapter's first), or null. */
export function parseReference(text, bible) {
  const m = text.trim().toLowerCase().match(/^(\d?\s*[a-z][a-z .]*?)\s*(\d+)(?:\s*[:.\s]\s*(\d*))?$/);
  if (!m) return null;
  const name = squash(m[1]).replaceAll('.', '');
  const names = (b) => [b.name, b.bsbName, b.usfm].map(squash);
  const book = BOOKS.find((b) => names(b).includes(name)) ?? BOOKS.find((b) => names(b).some((n) => n.startsWith(name)));
  const chapter = book && bible.chapter(book.order, Number(m[2]));
  if (!chapter) return null;
  const verses = bible.verses(chapter).filter((v) => v.text);
  return m[3] ? verses.find((v) => v.verse === Number(m[3])) ?? null : verses[0];
}
