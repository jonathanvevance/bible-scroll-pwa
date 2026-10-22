import { Journal } from '../src/data/journal.js';
import { test, eq, ok } from './runner.js';

// Each test gets its own database, so tests never share state or touch the app's own.
let n = 0;
const dbName = () => `bible-scroll-test-${Date.now()}-${n++}`;
const fresh = () => Journal.open(dbName());

const GEN_1_1 = 1_001_001;
const GEN_1_2 = 1_001_002;
const JOHN_3_16 = 43_003_016;

const reflection = (id, verseKey, body, createdAt) => ({
  id, verseKey, body, createdAt, timeZoneID: 'Asia/Kolkata', updatedAt: null,
});

test('add trims the text and counts it', async () => {
  const j = await fresh();
  const row = await j.add('  In the beginning  ', GEN_1_1, 100);
  eq(row.body, 'In the beginning', 'body');
  eq(row.createdAt, 100, 'createdAt');
  eq(row.updatedAt, null, 'updatedAt');
  eq(j.count(GEN_1_1), 1, 'count');
});

test('add skips blank text', async () => {
  const j = await fresh();
  eq(await j.add('   ', GEN_1_1), null, 'result');
  eq(j.count(GEN_1_1), 0, 'count');
});

test('update keeps the date and marks it edited', async () => {
  const j = await fresh();
  const row = await j.add('first', GEN_1_1, 100);
  const edited = await j.update(row, ' second ');
  eq(edited.body, 'second', 'body');
  eq(edited.createdAt, 100, 'createdAt');
  ok(edited.updatedAt > 100, 'updatedAt is set');
  eq((await j.comments(GEN_1_1)).map((c) => c.body), ['second'], 'stored');
  eq(j.count(GEN_1_1), 1, 'count');
});

test('delete removes it and the count', async () => {
  const j = await fresh();
  const a = await j.add('a', GEN_1_1, 100);
  await j.add('b', GEN_1_1, 200);
  await j.delete(a);
  eq(j.count(GEN_1_1), 1, 'count after one delete');
  await j.delete((await j.comments(GEN_1_1))[0]);
  eq(j.count(GEN_1_1), 0, 'count after both');
  ok(!j.counts.has(GEN_1_1), 'no zero entry left in counts');
});

test('comments are newest first, allComments oldest first', async () => {
  const j = await fresh();
  await j.add('old', GEN_1_1, 100);
  await j.add('new', GEN_1_1, 300);
  await j.add('other verse', GEN_1_2, 200);
  eq((await j.comments(GEN_1_1)).map((c) => c.body), ['new', 'old'], 'comments');
  eq((await j.allComments()).map((c) => c.body), ['old', 'other verse', 'new'], 'allComments');
});

test('page: newest first since a time, with offset and limit', async () => {
  const j = await fresh();
  for (const [body, at] of [['a', 100], ['b', 200], ['c', 200], ['d', 300]]) await j.add(body, GEN_1_1, at);
  eq((await j.page(150, 0, 10)).map((c) => c.createdAt), [300, 200, 200], 'since 150');
  eq((await j.page(0, 1, 2)).map((c) => c.createdAt), [200, 200], 'offset 1, limit 2: same timestamps both kept');
  eq((await j.page(0, 3, 10)).map((c) => c.body), ['a'], 'offset 3');
  eq(await j.page(400, 0, 10), [], 'nothing newer');
});

test('importMany adds new ids only and never changes existing ones', async () => {
  const j = await fresh();
  await j.importMany([reflection('x', GEN_1_1, 'mine', 100)]);
  const result = await j.importMany([
    reflection('x', GEN_1_1, 'from the backup', 100),
    reflection('y', JOHN_3_16, 'new', 200),
    reflection('y', JOHN_3_16, 'duplicate in the file', 200),
  ]);
  eq(result, { added: 1, skipped: 2 }, 'result');
  eq((await j.comments(GEN_1_1)).map((c) => c.body), ['mine'], 'existing kept');
  eq((await j.comments(JOHN_3_16)).map((c) => c.body), ['new'], 'first copy of a duplicate wins');
  eq(j.count(JOHN_3_16), 1, 'count');
});

test('importMany keeps id, dates and time zone', async () => {
  const j = await fresh();
  const row = { ...reflection('z', GEN_1_1, 'text', 100), updatedAt: 150 };
  await j.importMany([row]);
  eq((await j.comments(GEN_1_1))[0], row, 'stored row');
});

test('toggleMark adds and removes', async () => {
  const j = await fresh();
  eq(await j.toggleMark('favourite', GEN_1_1), true, 'first toggle');
  ok(j.isMarked('favourite', GEN_1_1), 'marked');
  eq(j.markCount('favourite'), 1, 'count');
  eq(await j.toggleMark('favourite', GEN_1_1), false, 'second toggle');
  eq(j.markCount('favourite'), 0, 'count after');
});

test('importMarks adds only new verses and keeps existing dates', async () => {
  const j = await fresh();
  await j.toggleMark('favourite', GEN_1_1);
  const before = (await j.marks('favourite'))[0].createdAt;
  const added = await j.importMarks('favourite', [
    { verseKey: GEN_1_1, createdAt: 1 },
    { verseKey: JOHN_3_16, createdAt: 500 },
    { verseKey: JOHN_3_16, createdAt: 600 },
  ]);
  eq(added, 1, 'added');
  const marks = await j.marks('favourite');
  eq(marks.map((m) => [m.verseKey, m.createdAt]), [[GEN_1_1, before], [JOHN_3_16, 500]], 'marks, newest first');
  eq(j.markCount('favourite'), 2, 'count');
});

test('every write announces a change; writes that change nothing stay quiet', async () => {
  const j = await fresh();
  let changes = 0;
  j.addEventListener('change', () => changes++);
  const expect = async (write, n, label) => {
    const before = changes;
    await write();
    eq(changes - before, n, label);
  };
  let row;
  await expect(async () => { row = await j.add('one', GEN_1_1); }, 1, 'add');
  await expect(() => j.add('   ', GEN_1_1), 0, 'blank add');
  await expect(async () => { row = await j.update(row, 'two'); }, 1, 'update');
  await expect(() => j.addMany([{ verseKey: GEN_1_2, body: 'x', createdAt: 1 }]), 1, 'addMany');
  await expect(() => j.addMany([]), 0, 'empty addMany');
  await expect(() => j.importMany([reflection('r1', JOHN_3_16, 'y', 5)]), 1, 'importMany');
  await expect(() => j.importMany([reflection('r1', JOHN_3_16, 'y', 5)]), 0, 'importMany of known ids');
  await expect(() => j.toggleMark('favourite', GEN_1_1), 1, 'toggleMark');
  await expect(() => j.importMarks('favourite', [{ verseKey: JOHN_3_16, createdAt: 1 }]), 1, 'importMarks');
  await expect(() => j.importMarks('favourite', [{ verseKey: JOHN_3_16, createdAt: 1 }]), 0, 'importMarks of known verses');
  await expect(() => j.delete(row), 1, 'delete');
  await expect(() => j.deleteAll(), 1, 'deleteAll');
});

test('reopening reloads counts and marks', async () => {
  const name = dbName();
  const j = await Journal.open(name);
  await j.add('a', GEN_1_1);
  await j.add('b', GEN_1_1);
  await j.toggleMark('favourite', JOHN_3_16);
  const again = await Journal.open(name);
  eq(again.count(GEN_1_1), 2, 'count');
  ok(again.isMarked('favourite', JOHN_3_16), 'mark');
});

test('upgrading a version 1 database keeps every reflection', async () => {
  const name = dbName();
  await new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => {
      const store = r.result.createObjectStore('comments', { keyPath: 'id' });
      store.createIndex('verseKey', 'verseKey');
      store.createIndex('createdAt', 'createdAt');
      store.add(reflection('old', GEN_1_1, 'written before likes', 100));
    };
    r.onsuccess = () => { r.result.close(); resolve(); };
    r.onerror = () => reject(r.error);
  });
  const j = await Journal.open(name);
  eq((await j.allComments()).map((c) => c.body), ['written before likes'], 'reflections');
  eq(j.count(GEN_1_1), 1, 'count');
  eq(await j.toggleMark('favourite', GEN_1_1), true, 'likes work after the upgrade');
});
