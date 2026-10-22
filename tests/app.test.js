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
