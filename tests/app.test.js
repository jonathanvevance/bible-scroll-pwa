import { test, ok, eq } from './runner.js';

// Loads the real app in a phone-sized frame. A module that fails to load (a wrong import, or one
// used before it is ready) stops start-up, so the loading message never goes away.
const until = async (check, ms = 10_000) => {
  for (const end = performance.now() + ms; performance.now() < end;) {
    const value = check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
};

test('the app starts and shows the feed', async () => {
  const frame = Object.assign(document.createElement('iframe'), { src: 'index.html', width: 390, height: 844 });
  document.body.append(frame);
  const doc = await until(() => frame.contentDocument?.getElementById('feed') && frame.contentDocument);
  ok(doc, 'page loaded');
  const loading = () => doc.getElementById('loading');
  await until(() => !loading() || loading().textContent.startsWith("Couldn't"));
  eq(loading()?.textContent ?? null, null, 'loading message');
  ok(doc.getElementById('feed').children.length > 0, 'feed has pages');
  ok(doc.querySelector('.page.verse .actions [data-action="like"]'), 'verse actions rendered');
  frame.remove();
});

test('the Jump sheet opens on the book being read', async () => {
  const frame = Object.assign(document.createElement('iframe'), { src: 'index.html', width: 390, height: 844 });
  document.body.append(frame);
  const doc = await until(() => frame.contentDocument?.querySelector('.page.verse') && frame.contentDocument);
  ok(doc, 'app started');
  const errors = [];
  frame.contentWindow.addEventListener('error', (e) => errors.push(e.message));
  doc.getElementById('jumpButton').click();
  ok(doc.getElementById('jump').open, 'sheet open');
  ok(doc.getElementById('readingBook').textContent, 'book being read');
  ok(doc.getElementById('readingChapter').textContent.startsWith('Reading · Ch '), 'chapter being read');
  eq(errors, [], 'errors');
  frame.remove();
});

// The app's own modules, from inside the frame, so a test can write to the journal the app shows.
test('an open Liked or Reflections tab updates when the journal changes', async () => {
  const frame = Object.assign(document.createElement('iframe'), { src: 'index.html', width: 390, height: 844 });
  document.body.append(frame);
  const doc = await until(() => frame.contentDocument?.querySelector('.page.verse') && frame.contentDocument);
  ok(doc, 'app started');
  const appModule = (path) => frame.contentWindow.eval(`import('${new URL(path, frame.contentWindow.location)}')`);
  const { journal } = await appModule('src/ui/app-state.js');
  const { LIKE } = await appModule('src/ui/actions.js');
  const JOHN_3_16 = 43_003_016;
  const card = (list) => doc.querySelector(`#${list} [data-key="${JOHN_3_16}"]`);

  doc.querySelector('[data-tab="liked"]').click();
  await journal.importMarks(LIKE, [{ verseKey: JOHN_3_16, createdAt: Date.now() }]);
  ok(await until(() => card('likedList')), 'a restored like appears in Liked');
  await journal.toggleMark(LIKE, JOHN_3_16);
  ok(await until(() => !card('likedList')), 'an unliked verse leaves Liked');

  doc.querySelector('[data-tab="reflections"]').click();
  const row = await journal.add('A test reflection', JOHN_3_16);
  ok(await until(() => card('reflectionsList')?.textContent.includes('A test reflection')), 'a new reflection appears');
  await journal.delete(row);
  ok(await until(() => !card('reflectionsList')), 'a deleted reflection leaves');
  frame.remove();
});
