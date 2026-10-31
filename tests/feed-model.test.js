import { itemsFor, windowAfterSettling, startFor, advanceTarget } from '../src/core/feed-model.js';
import { test, eq, ok } from './runner.js';
import { realBible } from './bible.js';

const ids = (items) => items.map((i) => i.id);
const keys = (window) => window.map((ch) => ch.key);

test('itemsFor: boundaries around and between chapters, empty verses skipped', async () => {
  const bible = await realBible();
  const matt17 = bible.chapter(40, 17);
  const items = itemsFor(bible, [matt17]);
  eq(items[0].id, `b${bible.chapter(40, 16).key}-${matt17.key}`, 'leading boundary');
  eq(items.at(-1).id, `b${matt17.key}-${bible.chapter(40, 18).key}`, 'trailing boundary');
  ok(!ids(items).includes('v40017021'), 'Matthew 17:21 (not in the BSB) has no page');
  eq(items.filter((i) => i.type === 'verse').length, 26, 'verse pages');
});

test('itemsFor: end caps at Genesis 1 and Revelation 22', async () => {
  const bible = await realBible();
  const first = itemsFor(bible, [bible.chapters[0]]);
  eq([first[0].before, first[0].id], [null, `b0-${bible.chapters[0].key}`], 'start cap');
  const last = itemsFor(bible, [bible.chapters.at(-1)]).at(-1);
  eq([last.after, last.id], [null, `b${bible.chapters.at(-1).key}-0`], 'end cap');
});

test('startFor: the saved verse, its chapter in the middle of the window', async () => {
  const bible = await realBible();
  const start = startFor(bible, 43_003_016);
  eq(start.id, 'v43003016', 'page');
  eq(keys(start.window), [43_002_000, 43_003_000, 43_004_000], 'window');
});

test('startFor: unknown or missing verses fall back sensibly', async () => {
  const bible = await realBible();
  eq(startFor(bible, 0).id, 'v1001001', 'nothing saved -> Genesis 1:1');
  eq(startFor(bible, 99_001_001).id, 'v1001001', 'bad key -> Genesis 1:1');
  eq(startFor(bible, 43_003_099).id, 'v43003001', 'verse past the end -> chapter start');
  eq(keys(startFor(bible, 1_001_001).window), [1_001_000, 1_002_000], 'Genesis 1 has no chapter before');
});

test('windowAfterSettling: recentres only when the chapter changes', async () => {
  const bible = await realBible();
  const { window } = startFor(bible, 43_003_016);
  const verse = (key) => ({ type: 'verse', verse: { book: Math.floor(key / 1e6), chapter: Math.floor(key / 1e3) % 1e3 } });
  eq(windowAfterSettling(bible, verse(43_003_017), window), null, 'same chapter');
  eq(keys(windowAfterSettling(bible, verse(43_004_001), window)), [43_003_000, 43_004_000, 43_005_000], 'next chapter');
  eq(windowAfterSettling(bible, { type: 'boundary' }, window), null, 'boundary');
});

test('advanceTarget: forward to the next chapter, back to the previous one', async () => {
  const bible = await realBible();
  const { window } = startFor(bible, 43_003_016);
  const items = itemsFor(bible, window);
  const between = items.find((i) => i.type === 'boundary' && i.before?.key === 43_003_000);
  eq(advanceTarget(between, 'v43003036', items), 'v43004001', 'coming from John 3');
  eq(advanceTarget(between, 'v43004001', items), 'v43003036', 'coming from John 4');
  eq(advanceTarget(between, null, items), null, 'no previous page');
  eq(advanceTarget(items.find((i) => i.type === 'verse'), 'v43003001', items), null, 'not a boundary');
});

test('advanceTarget: end caps never advance', async () => {
  const bible = await realBible();
  const items = itemsFor(bible, [bible.chapters[0]]);
  eq(advanceTarget(items[0], 'v1001001', items), null, 'before Genesis 1');
});

test('verses: psalm titles on verse 1, Proverbs openings on their own verse', async () => {
  const bible = await realBible();
  const psalm3 = bible.verses(bible.chapter(19, 3));
  ok(psalm3[0].title?.startsWith('A Psalm of David'), 'Psalm 3:1 title');
  eq(psalm3[1].title, undefined, 'Psalm 3:2 has none');
  const prov24 = bible.verses(bible.chapter(20, 24));
  eq(prov24[22].title, 'These also are sayings of the wise:', 'Proverbs 24:23 title');
  eq(prov24[22].text, 'To show partiality in judgment is not good.', 'Proverbs 24:23 text');
  eq(prov24[0].title, undefined, 'Proverbs 24:1 has none');
  eq(bible.verses(bible.chapter(20, 10))[0].title, 'The proverbs of Solomon:', 'Proverbs 10:1 title');
  eq(bible.verses(bible.chapter(20, 25))[0].title, undefined, 'Proverbs 25:1 stays a verse');
});
