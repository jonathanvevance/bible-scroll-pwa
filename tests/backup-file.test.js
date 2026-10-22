import { readBackup } from '../src/core/backup-file.js';
import { test, eq, throws } from './runner.js';

const reflection = {
  id: 'r1', verseKey: 43_003_016, reference: 'John 3:16', verseText: 'For God so loved…',
  body: 'Loved', createdAt: 100, createdAtISO: '1970-01-01T00:00:00.100Z', timeZoneID: 'Asia/Kolkata', updatedAt: null,
};
const like = { verseKey: 1_001_001, reference: 'Genesis 1:1', verseText: 'In the beginning…', createdAt: 200, createdAtISO: '' };
const file = (extra = {}) => JSON.stringify({ app: 'Bible Scroll', format: 1, reflections: [reflection], likes: [like], ...extra });

test('readBackup keeps only what restoring needs', () => {
  eq(readBackup(file()), {
    reflections: [{ id: 'r1', verseKey: 43_003_016, body: 'Loved', createdAt: 100, timeZoneID: 'Asia/Kolkata', updatedAt: null }],
    likes: [{ verseKey: 1_001_001, createdAt: 200 }],
  }, 'result');
});

test('readBackup: backups from before likes existed', () => {
  const data = JSON.parse(file());
  delete data.likes;
  eq(readBackup(JSON.stringify(data)).likes, [], 'likes');
});

test('readBackup fills a missing time zone and keeps an edit date', () => {
  const { timeZoneID, ...noZone } = reflection;
  const [r] = readBackup(file({ reflections: [{ ...noZone, updatedAt: 150 }] })).reflections;
  eq(r.timeZoneID, Intl.DateTimeFormat().resolvedOptions().timeZone, 'time zone');
  eq(r.updatedAt, 150, 'updatedAt');
});

test('readBackup rejects files that are not backups', async () => {
  for (const text of ['', 'not json', '{}', JSON.stringify({ app: 'Other', reflections: [] }), file({ format: 0 }), file({ format: '1' })]) {
    await throws(() => readBackup(text), /isn't a Bible Scroll backup/, `"${text.slice(0, 30)}"`);
  }
});

test('readBackup rejects a newer format', async () => {
  await throws(() => readBackup(file({ format: 2 })), /newer version/, 'format 2');
});

test('readBackup rejects the whole file if any record is damaged', async () => {
  await throws(() => readBackup(file({ likes: 'x' })), /likes in this backup are damaged/, 'likes not a list');
  await throws(() => readBackup(file({ likes: [like, { verseKey: 1_001_000, createdAt: 1 }] })), /Liked verse 2/, 'bad like key');
  for (const bad of [{ id: '' }, { verseKey: 5 }, { body: '  ' }, { createdAt: 'x' }]) {
    await throws(() => readBackup(file({ reflections: [reflection, { ...reflection, ...bad }] })), /Reflection 2/, JSON.stringify(bad));
  }
});
