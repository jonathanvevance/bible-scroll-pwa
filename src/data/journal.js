// Reflections, stored in IndexedDB (the browser's on-device database). Same shape as
// the iOS VerseComment: keyed by the packed verse key, never the verse text.

const STORE = 'comments';
/** Favourites and bookmarks: one row per (kind, verseKey). */
const MARKS = 'marks';

const request = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const committed = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

function openDatabase(name) {
  const r = indexedDB.open(name, 2);
  r.onupgradeneeded = (event) => {
    const db = r.result;
    if (event.oldVersion < 1) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('verseKey', 'verseKey');
      store.createIndex('createdAt', 'createdAt');
    }
    if (event.oldVersion < 2) {
      db.createObjectStore(MARKS, { keyPath: 'id' }).createIndex('kind', 'kind');
    }
  };
  return request(r);
}

// randomUUID only exists on HTTPS; the Wi-Fi preview runs over plain HTTP.
const newID = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * Fires `change` after every write, so screens refresh themselves rather than at each write site.
 * Fires `closed` when a newer version of the app, open in another tab, upgrades the database: this
 * one lets go so the upgrade can finish, and can't be used again.
 */
export class Journal extends EventTarget {
  /** Each language's app has its own database; tests use throwaway names. */
  static async open(name) {
    const journal = new Journal(await openDatabase(name));
    await journal.#reloadCounts();
    await journal.#reloadMarks();
    return journal;
  }

  #db;
  /** verseKey -> number of reflections, so badges never query the database. */
  counts = new Map();
  /** kind ('favourite' | 'bookmark') -> Set of verse keys. */
  #marked = new Map([['favourite', new Set()], ['bookmark', new Set()]]);

  constructor(db) {
    super();
    this.#db = db;
    db.onversionchange = () => {
      db.close();
      this.dispatchEvent(new Event('closed'));
    };
  }

  #changed() {
    this.dispatchEvent(new Event('change'));
  }

  count(verseKey) {
    return this.counts.get(verseKey) ?? 0;
  }

  async add(body, verseKey, createdAt = Date.now()) {
    const added = await this.addMany([{ body, verseKey, createdAt }]);
    return added[0] ?? null;
  }

  /** One transaction for many rows; blank bodies are skipped. */
  async addMany(entries) {
    const timeZoneID = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const rows = entries
      .map(({ body, verseKey, createdAt = Date.now() }) => ({
        id: newID(), verseKey, body: body.trim(), createdAt, timeZoneID, updatedAt: null,
      }))
      .filter((row) => row.body);
    if (!rows.length) return [];
    const tx = this.#db.transaction(STORE, 'readwrite');
    for (const row of rows) tx.objectStore(STORE).add(row);
    await committed(tx);
    for (const row of rows) this.counts.set(row.verseKey, this.count(row.verseKey) + 1);
    this.#changed();
    return rows;
  }

  /** New text for a reflection; it keeps its date and is marked as edited. */
  async update(comment, body) {
    const row = { ...comment, body: body.trim(), updatedAt: Date.now() };
    const tx = this.#db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    await committed(tx);
    this.#changed();
    return row;
  }

  async delete(comment) {
    const tx = this.#db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(comment.id);
    await committed(tx);
    const n = this.count(comment.verseKey) - 1;
    if (n > 0) this.counts.set(comment.verseKey, n);
    else this.counts.delete(comment.verseKey);
    this.#changed();
  }

  /** Newest first. */
  async comments(verseKey) {
    const tx = this.#db.transaction(STORE);
    const rows = await request(tx.objectStore(STORE).index('verseKey').getAll(verseKey));
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Adds the reflections whose id is not already here, in one transaction; never changes or
   * removes existing ones. Returns how many were added and how many were already here.
   */
  async importMany(rows) {
    const tx = this.#db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const fresh = [];
    // Added from the callback, not after an await, so the transaction is still open.
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      const seen = new Set(keys.result);
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        fresh.push(row);
        store.add(row);
      }
    };
    await committed(tx);
    for (const row of fresh) this.counts.set(row.verseKey, this.count(row.verseKey) + 1);
    if (fresh.length) this.#changed();
    return { added: fresh.length, skipped: rows.length - fresh.length };
  }

  /** Every reflection, oldest first. */
  async allComments() {
    const tx = this.#db.transaction(STORE);
    return request(tx.objectStore(STORE).index('createdAt').getAll());
  }

  /**
   * One page, newest first: up to `limit` reflections created since `from`, after skipping
   * the newest `offset`. Counting rather than resuming from a time keeps reflections with the
   * same timestamp from being skipped.
   */
  async page(from, offset, limit) {
    const index = this.#db.transaction(STORE).objectStore(STORE).index('createdAt');
    const cursor = index.openCursor(IDBKeyRange.lowerBound(from), 'prev');
    const rows = [];
    let skipping = offset > 0;
    await new Promise((resolve, reject) => {
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        if (skipping) {
          skipping = false;
          return c.advance(offset);
        }
        rows.push(c.value);
        if (rows.length < limit) c.continue();
        else resolve();
      };
      cursor.onerror = () => reject(cursor.error);
    });
    return rows;
  }

  async deleteAll() {
    const tx = this.#db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await committed(tx);
    this.counts.clear();
    this.#changed();
  }

  isMarked(kind, verseKey) {
    return this.#marked.get(kind).has(verseKey);
  }

  /** Adds or removes the mark; returns whether the verse is now marked. */
  async toggleMark(kind, verseKey) {
    const id = `${kind}:${verseKey}`;
    const marked = !this.isMarked(kind, verseKey);
    const tx = this.#db.transaction(MARKS, 'readwrite');
    if (marked) tx.objectStore(MARKS).put({ id, kind, verseKey, createdAt: Date.now() });
    else tx.objectStore(MARKS).delete(id);
    await committed(tx);
    if (marked) this.#marked.get(kind).add(verseKey);
    else this.#marked.get(kind).delete(verseKey);
    this.#changed();
    return marked;
  }

  markCount(kind) {
    return this.#marked.get(kind).size;
  }

  /** Adds the marks not already here, in one transaction; existing ones keep their date. */
  async importMarks(kind, rows) {
    const marked = this.#marked.get(kind);
    const fresh = new Map();
    for (const row of rows) {
      if (!marked.has(row.verseKey) && !fresh.has(row.verseKey)) fresh.set(row.verseKey, row);
    }
    if (!fresh.size) return 0;
    const tx = this.#db.transaction(MARKS, 'readwrite');
    for (const { verseKey, createdAt } of fresh.values()) {
      tx.objectStore(MARKS).put({ id: `${kind}:${verseKey}`, kind, verseKey, createdAt });
    }
    await committed(tx);
    for (const verseKey of fresh.keys()) marked.add(verseKey);
    this.#changed();
    return fresh.size;
  }

  /** Newest first. */
  /** Whether a reflection was written or edited, or a verse marked, after `time`. */
  async changedSince(time) {
    const tx = this.#db.transaction([STORE, MARKS]);
    const [comments, marks] = await Promise.all([
      request(tx.objectStore(STORE).getAll()),
      request(tx.objectStore(MARKS).getAll()),
    ]);
    return comments.some((c) => Math.max(c.createdAt, c.updatedAt ?? 0) > time)
      || marks.some((m) => m.createdAt > time);
  }

  async marks(kind) {
    const tx = this.#db.transaction(MARKS);
    const rows = await request(tx.objectStore(MARKS).index('kind').getAll(kind));
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  async #reloadMarks() {
    const rows = await request(this.#db.transaction(MARKS).objectStore(MARKS).getAll());
    for (const row of rows) this.#marked.get(row.kind)?.add(row.verseKey);
  }

  async #reloadCounts() {
    this.counts.clear();
    const cursor = this.#db.transaction(STORE).objectStore(STORE).index('verseKey').openKeyCursor();
    await new Promise((resolve, reject) => {
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve();
        this.counts.set(c.key, this.count(c.key) + 1);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  }
}
