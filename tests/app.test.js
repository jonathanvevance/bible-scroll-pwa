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

/** Opens `src` in a phone-sized frame and waits for the feed's first verse page. */
async function boot(src = 'index.html') {
  const frame = Object.assign(document.createElement('iframe'), { src, width: 390, height: 844 });
  document.body.append(frame);
  const doc = await until(() => frame.contentDocument?.querySelector('.page.verse') && frame.contentDocument, 20_000);
  const appModule = (path) => frame.contentWindow.eval(`import('${new URL(path, frame.contentWindow.location)}')`);
  return { frame, doc, appModule };
}

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
  const { frame, doc } = await boot();
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
  const { frame, doc, appModule } = await boot();
  ok(doc, 'app started');
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

test('the Malayalam app shows its own text and keeps its data apart from English', async () => {
  const { frame, doc, appModule } = await boot('ml/index.html');
  ok(doc, 'app started');
  ok(/[\u0D00-\u0D7F]/.test(doc.querySelector('.page.verse .verse-text').textContent), 'verse in Malayalam');
  ok(doc.getElementById('attribution').textContent.includes('സത്യവേദപുസ്തകം'), 'attribution');
  const { journal } = await appModule('../src/ui/app-state.js');
  const { prefs } = await appModule('../src/data/prefs.js');
  const { Journal } = await import('../src/data/journal.js');

  const PSALM_23_1 = 19_023_001;
  const before = localStorage.getItem('lastVerseKey');
  await journal.toggleMark('favourite', PSALM_23_1);
  prefs.lastVerse.set(PSALM_23_1);
  const english = await Journal.open('bible-scroll');
  ok(journal.isMarked('favourite', PSALM_23_1), 'liked in Malayalam');
  eq(english.isMarked('favourite', PSALM_23_1), false, 'not in the English journal');
  eq(localStorage.getItem('ml.lastVerseKey'), String(PSALM_23_1), 'setting stored under ml.');
  eq(localStorage.getItem('lastVerseKey'), before, 'English setting untouched');
  ok((await indexedDB.databases()).some((d) => d.name === 'bible-scroll-ml'), 'own database');
  await journal.toggleMark('favourite', PSALM_23_1);
  prefs.lastVerse.clear();
  frame.remove();
});

test('every file each app caches for offline use exists', async () => {
  for (const worker of ['sw.js', 'ml/sw.js']) {
    const text = await (await fetch(worker)).text();
    const value = (name) => new RegExp(`const ${name} = '([^']*)';`).exec(text)[1];
    const list = text.slice(text.indexOf('const ASSETS = ['), text.indexOf('].map('));
    const own = ['./', 'index.html', 'manifest.webmanifest', value('BIBLE')];
    const shared = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => !own.includes(f));
    for (const file of [...own, ...shared.map((f) => value('SHARED') + f)]) {
      const url = new URL(file, new URL(worker, location));
      eq((await fetch(url, { method: 'HEAD' })).status, 200, `${worker}: ${file}`);
    }
  }
});
