// What the Malayalam app (served from ml/) has of its own. Its storage names are the ones the
// separate Malayalam app used, so the two apps never share or overwrite each other's data.
// release.py reads `cacheName` and `bibleFile` too, so keep each on one line as `key: '…',`.

export default {
  bibleFile: 'mal1910.json',
  quoteName: 'Sathyavedapusthakam',
  translation: 'Sathyavedapusthakam 1910',
  /** The 1910 text in YouVersion: Malayalam OV Bible, MALOVBSI (bible.com/bible/1693). */
  youVersion: 1693,
  backupFileName: 'Bible Scroll Malayalam backup.json',
  database: 'bible-scroll-ml',
  storagePrefix: 'ml.',
  cacheName: 'bible-scroll-ml',
  attribution: 'മലയാളം സത്യവേദപുസ്തകം 1910 (contemporary orthography), © 2015 '
    + '<a href="https://ebible.org/details.php?id=mal2015">The Free Bible Foundation</a>, '
    + '<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. Changed: converted from USFM, notes and headings omitted, '
    + 'psalm titles, three Proverbs section openings and Habakkuk\'s closing note set apart from the verses. Not endorsed by The Free Bible Foundation.',
};
