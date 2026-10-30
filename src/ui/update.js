// ---------- Version and Check for Update ----------
// A new version normally waits for the next launch (see sw.js). Check for Update fetches it now,
// lets it take over at once and reloads, so no page runs files from two versions for long.

const versionLine = document.getElementById('appVersion');
const updateButton = document.getElementById('updateButton');
let version = null;

/** The grey value at the end of the row: the version, or how a check is going. */
function showVersion(note) {
  versionLine.textContent = note ?? (version ? `Version ${version}` : '');
}

// Blank until the service worker running the app answers (none on the first visit).
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (!event.data?.version) return;
  version = event.data.version;
  showVersion();
});

for (const button of document.querySelectorAll('.you-button')) {
  button.addEventListener('click', () => navigator.serviceWorker?.controller?.postMessage('version'));
}

/** Resolves once `worker` has finished downloading (or failed: then it is 'redundant'). */
const installed = (worker) => new Promise((resolve) => {
  if (worker.state !== 'installing') return resolve(worker.state);
  worker.addEventListener('statechange', () => {
    if (worker.state !== 'installing') resolve(worker.state);
  });
});

updateButton.closest('li').hidden = !navigator.serviceWorker;
updateButton.addEventListener('click', async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return showVersion('Not available yet');
  updateButton.disabled = true;
  showVersion('Checking…');
  // A check can take a few milliseconds; held for a second, "Checking…" reads as a step, not a flicker.
  const held = new Promise((resolve) => setTimeout(resolve, 1000));
  const checked = await registration.update().then(() => true, () => false);
  await held;
  if (!checked) {
    updateButton.disabled = false;
    return showVersion('Offline');
  }
  const next = registration.installing ?? registration.waiting;
  if (!next) {
    updateButton.disabled = false;
    return showVersion('Up to date');
  }
  showVersion('Updating…');
  if (await installed(next) === 'redundant') {
    updateButton.disabled = false;
    return showVersion("Couldn't update");
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  next.postMessage('skipWaiting');
});
