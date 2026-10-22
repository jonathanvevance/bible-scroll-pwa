// A tiny test runner: no dependencies, runs in any browser. tests/run.sh opens tests.html in
// headless Chrome and reads the results the page reports back to the server.

const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

const show = (value) => JSON.stringify(value) ?? String(value);

/** Deep equality by JSON, which is enough for the plain data the app stores. */
export function eq(actual, expected, what = 'value') {
  if (show(actual) !== show(expected)) throw new Error(`${what}: expected ${show(expected)}, got ${show(actual)}`);
}

export function ok(condition, what = 'condition') {
  if (!condition) throw new Error(`${what} is false`);
}

export async function throws(fn, pattern, what = 'call') {
  try {
    await fn();
  } catch (error) {
    if (pattern && !pattern.test(error?.message)) throw new Error(`${what} threw "${error?.message}", expected ${pattern}`);
    return;
  }
  throw new Error(`${what} did not throw`);
}

const report = (line) => fetch(`__test?${encodeURIComponent(line)}`).catch(() => {});

export async function run() {
  const out = document.getElementById('results');
  let failed = 0;
  for (const { name, fn } of tests) {
    let line;
    try {
      await fn();
      line = `PASS ${name}`;
    } catch (error) {
      failed++;
      line = `FAIL ${name}: ${error?.message ?? error}`;
    }
    out.textContent += `${line}\n`;
    await report(line);
  }
  const summary = `DONE ${tests.length - failed}/${tests.length} passed`;
  out.textContent += summary;
  document.title = failed ? 'FAIL' : 'PASS';
  await report(summary);
}
