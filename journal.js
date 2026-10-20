// Reflections, stored in IndexedDB (the browser's on-device database). Same shape as
// the iOS VerseComment: keyed by the packed verse key, never the verse text.

const DB_NAME = 'bible-scroll';
const STORE = 'comments';

const request = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const committed = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

function openDatabase() {
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    const store = r.result.createObjectStore(STORE, { keyPath: 'id' });
    store.createIndex('verseKey', 'verseKey');
    store.createIndex('createdAt', 'createdAt');
  };
  return request(r);
}

// randomUUID only exists on HTTPS; the Wi-Fi preview runs over plain HTTP.
const newID = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export class Journal {
  static async open() {
    const journal = new Journal(await openDatabase());
    await journal.#reloadCounts();
    return journal;
  }

  #db;
  /** verseKey -> number of reflections, so badges never query the database. */
  counts = new Map();

  constructor(db) {
    this.#db = db;
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
    return rows;
  }

  async delete(comment) {
    const tx = this.#db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(comment.id);
    await committed(tx);
    const n = this.count(comment.verseKey) - 1;
    if (n > 0) this.counts.set(comment.verseKey, n);
    else this.counts.delete(comment.verseKey);
  }

  /** Newest first. */
  async comments(verseKey) {
    const tx = this.#db.transaction(STORE);
    const rows = await request(tx.objectStore(STORE).index('verseKey').getAll(verseKey));
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteAll() {
    const tx = this.#db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await committed(tx);
    this.counts.clear();
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
