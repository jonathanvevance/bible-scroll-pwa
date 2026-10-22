// What the English app has of its own. Its storage names are the ones the app has always used,
// so the existing home-screen app keeps its reflections, likes and settings.
// pages.py reads `cacheName` and `bibleFile` too, so keep each on one line as `key: '…',`.

export default {
  /** The text, relative to the page. */
  bibleFile: 'bsb.json',
  /** After a shared verse: “…” (John 3:16, BSB). */
  quoteName: 'BSB',
  /** Written into backups. */
  translation: 'BSB',
  backupFileName: 'Bible Scroll backup.json',
  database: 'bible-scroll',
  storagePrefix: '',
  cacheName: 'bible-scroll',
  attribution: 'The Holy Bible, Berean Standard Bible (BSB), dedicated to the public domain.',
};
