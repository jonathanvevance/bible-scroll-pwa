import { packKey, unpackKey, verseName, chapterName, hubURL, HUB_TOOLS, parseReference } from '../src/core/references.js';
import { test, eq } from './runner.js';
import { realBible } from './bible.js';

test('packKey and unpackKey round-trip, matching the iOS key', () => {
  eq(packKey(43, 3, 16), 43_003_016, 'John 3:16');
  eq(packKey(1, 1), 1_001_000, 'chapter key has verse 0');
  eq(unpackKey(43_003_016), { book: 43, chapter: 3, verse: 16 }, 'unpack');
});

test('unpackKey rejects keys that are not a verse', () => {
  eq(unpackKey(1_001_000), null, 'verse 0');
  eq(unpackKey(67_001_001), null, 'book 67');
  eq(unpackKey(0), null, 'zero');
});

test('names', () => {
  eq(verseName({ book: 19, chapter: 23, verse: 1 }), 'Psalm 23:1', 'verse');
  eq(chapterName({ book: 1, chapter: 50 }), 'Genesis 50', 'chapter');
});

test('Bible Hub links', () => {
  const v = { book: 43, chapter: 3, verse: 16 };
  eq(HUB_TOOLS.map(([, tool]) => hubURL(tool, v)), [
    'https://biblehub.com/parallel/john/3-16.htm',
    'https://biblehub.com/john/3.htm',
    'https://biblehub.com/crossref/john/3-16.htm',
    'https://biblehub.com/commentaries/john/3-16.htm',
  ], 'links');
});

const ref = async (text) => {
  const v = parseReference(text, await realBible());
  return v && verseName(v);
};

test('parseReference: what the search box accepts', async () => {
  const cases = {
    'gen 1': 'Genesis 1:1',
    'gen 1:': 'Genesis 1:1',
    'gen 1:1': 'Genesis 1:1',
    'gen 1:12': 'Genesis 1:12',
    'Gen 1 12': 'Genesis 1:12',
    'gen 1.12': 'Genesis 1:12',
    'John 1:10': 'John 1:10',
    '1 cor 13 4': '1 Corinthians 13:4',
    '1cor13:4': '1 Corinthians 13:4',
    'ps23': 'Psalm 23:1',
    'psalm 119:176': 'Psalm 119:176',
    'song 2:1': 'Song of Solomon 2:1',
    '  rev 22:21  ': 'Revelation 22:21',
  };
  for (const [text, expected] of Object.entries(cases)) eq(await ref(text), expected, `"${text}"`);
});

test('parseReference: rejects what is not a verse', async () => {
  for (const text of ['', 'gen', '1', 'gen 51', 'gen 1:32', 'xyz 1:1', 'jude 2:1']) eq(await ref(text), null, `"${text}"`);
});

test('parseReference: a verse missing from the BSB is not found', async () => {
  eq(await ref('matt 17:21'), null, 'Matthew 17:21');
});
