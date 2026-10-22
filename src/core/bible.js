// The Bible text: chapters in reading order and their verses. No DOM, so tests can import it.

import { packKey, unpackKey } from './references.js';

export class Bible {
  /** `titles`: psalm superscriptions by "book:chapter"; `notes`: closing notes by "book:chapter:verse". */
  constructor({ books, titles = {}, notes = {} }) {
    this.books = books;
    this.titles = titles;
    this.notes = notes;
    this.chapters = [];
    this.index = new Map();
    books.forEach((chapters, b) => chapters.forEach((_, c) => {
      const ch = { book: b + 1, chapter: c + 1, key: packKey(b + 1, c + 1) };
      this.index.set(ch.key, this.chapters.length);
      this.chapters.push(ch);
    }));
  }

  chapter(book, chapter) {
    return this.chapters[this.index.get(packKey(book, chapter))] ?? null;
  }

  verses(ch) {
    return this.books[ch.book - 1][ch.chapter - 1].map((text, i) => ({
      book: ch.book, chapter: ch.chapter, verse: i + 1, key: ch.key + i + 1, text,
      title: i === 0 ? this.titles[`${ch.book}:${ch.chapter}`] : undefined,
      note: this.notes[`${ch.book}:${ch.chapter}:${i + 1}`],
    }));
  }

  /** The text of the verse with packed `key`, or null when there is no such verse. */
  text(key) {
    const v = unpackKey(key);
    return v ? this.books[v.book - 1]?.[v.chapter - 1]?.[v.verse - 1] ?? null : null;
  }

  after(ch) { return this.chapters[this.index.get(ch.key) + 1] ?? null; }
  before(ch) { return this.chapters[this.index.get(ch.key) - 1] ?? null; }
}
