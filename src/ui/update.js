// ---------- Version and Check for Update ----------
// A new version normally waits for the next launch (see sw.js). Check for Update fetches it now,
// lets it take over at once and reloads, so no page runs files from two versions for long.

const versionLine = document.getElementById('appVersion');
const updateButton = document.getElementById('updateButton');
let version = null;

function showVersion(note) {
  versionLine.textContent = [version && `Version ${version}`, note].filter(Boolean).join(' · ');
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
  if (!registration) return showVersion('Not installed for offline use yet');
  updateButton.disabled = true;
  showVersion('Checking…');
  try {
    await registration.update();
  } catch {
    updateButton.disabled = false;
    return showVersion("Couldn't check. Are you online?");
  }
  const next = registration.installing ?? registration.waiting;
  if (!next) {
    updateButton.disabled = false;
    return showVersion('Up to date');
  }
  showVersion('Updating…');
  if (await installed(next) === 'redundant') {
    updateButton.disabled = false;
    return showVersion("Couldn't download the update. Try again.");
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  next.postMessage('skipWaiting');
});
