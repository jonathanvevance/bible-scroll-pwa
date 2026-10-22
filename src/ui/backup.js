import { BACKUP_FORMAT, readBackup } from '../core/backup-file.js';
import { unpackKey, verseName } from '../core/references.js';
import { LIKE } from './actions.js';
import { bible, journal } from './app-state.js';
import { el, toast } from './dom.js';
import { updateActions } from './feed.js';
import { backupBanner, renderReflections } from './reflections.js';
import { closeSheet } from './sheets.js';
import { tab } from './tabs.js';

// ---------- Backup ----------
// A backup is one readable JSON file the person saves to iCloud Drive through the share sheet.
// Restoring only needs id, verseKey, body, createdAt, timeZoneID and updatedAt for a reflection,
// and verseKey and createdAt for a like; the reference, verse text and ISO date are there so the
// file still makes sense without the app. Likes were added without a new format number: older
// versions of the app ignore them rather than refusing the file.

const LAST_BACKUP = 'lastBackupAt';
const LAST_BACKUP_COUNT = 'lastBackupCount';
const LAST_BACKUP_LIKES = 'lastBackupLikes';
const backup = document.getElementById('backup');
const backupStatus = document.getElementById('backupStatus');
const backupNow = document.getElementById('backupNow');
const bannerBackup = document.getElementById('bannerBackup');
/**
 * Built ahead of the tap: iOS only allows sharing straight after one, with no waiting in between.
 * Any change to the reflections makes it stale (`invalidateBackup`).
 */
export let backupReady = null;
let backupBuild = 0;
let backupBuilding = -1;

const reflectionTotal = () => [...journal.counts.values()].reduce((sum, n) => sum + n, 0);
const likeTotal = () => journal.markCount(LIKE);
const likedPlural = (n) => `${n} liked verse${n === 1 ? '' : 's'}`;
/** "3 reflections and 2 liked verses", leaving out whichever is zero. */
const contents = (reflections, likes) => [reflections || !likes ? plural(reflections) : null, likes ? likedPlural(likes) : null]
  .filter(Boolean).join(' and ');

async function backupFile() {
  const likes = (await journal.marks(LIKE)).reverse().map((m) => {
    const v = unpackKey(m.verseKey);
    return {
      verseKey: m.verseKey,
      reference: v ? verseName(v) : null,
      verseText: v ? bible.books[v.book - 1]?.[v.chapter - 1]?.[v.verse - 1] ?? null : null,
      createdAt: m.createdAt,
      createdAtISO: new Date(m.createdAt).toISOString(),
    };
  });
  const reflections = (await journal.allComments()).map((c) => {
    const v = unpackKey(c.verseKey);
    return {
      id: c.id,
      verseKey: c.verseKey,
      reference: v ? verseName(v) : null,
      verseText: v ? bible.books[v.book - 1]?.[v.chapter - 1]?.[v.verse - 1] ?? null : null,
      body: c.body,
      createdAt: c.createdAt,
      createdAtISO: new Date(c.createdAt).toISOString(),
      timeZoneID: c.timeZoneID,
      updatedAt: c.updatedAt ?? null,
    };
  });
  const now = new Date();
  const data = {
    app: 'Bible Scroll',
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    translation: 'BSB',
    count: reflections.length,
    reflections,
    likes,
  };
  // One fixed name, so saving to the same folder offers to replace the last backup.
  return new File([JSON.stringify(data, null, 2)], 'Bible Scroll backup.json', { type: 'application/json' });
}

export function setBackupEnabled(on) {
  for (const button of [backupNow, bannerBackup]) {
    button.disabled = !on;
    button.querySelector('.haptic').disabled = !on;
  }
}

export function invalidateBackup() {
  backupReady = null;
  shrinkAccepted = false;
  backupBuild++;
  setBackupEnabled(false);
}

/** Builds the file once per version of the reflections and likes; the backup buttons wait for it. */
function prepareBackup() {
  if (backupReady || !(reflectionTotal() + likeTotal())) return setBackupEnabled(backupReady !== null);
  if (backupBuilding === backupBuild) return;
  const build = backupBuilding = backupBuild;
  setBackupEnabled(false);
  backupFile()
    .then((file) => {
      if (build !== backupBuild) return;
      backupReady = file;
      setBackupEnabled(true);
    })
    .catch((error) => alert(`Couldn't prepare the backup: ${error?.message ?? error}`));
}

/** "Today at 3:51 PM", "Yesterday at …", or "20 Oct 2026 at …", like Settings. */
function backupTime(ms) {
  const date = new Date(ms);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
  return `${day} at ${new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date)}`;
}

function updateBackupStatus() {
  const last = Number(localStorage.getItem(LAST_BACKUP));
  const status = last ? `Last backup: ${backupTime(last)}`
    : reflectionTotal() + likeTotal() ? 'Never backed up' : 'Nothing to back up yet';
  backupStatus.textContent = `${status}\nIncludes reflections and liked verses. Save to Files, then iCloud Drive.`;
}

function updateStats() {
  const reflections = reflectionTotal();
  const likes = likeTotal();
  document.getElementById('reflectionStat').textContent = reflections;
  document.getElementById('reflectionStatLabel').textContent = reflections === 1 ? 'Reflection' : 'Reflections';
  document.getElementById('likeStat').textContent = likes;
  document.getElementById('likeStatLabel').textContent = likes === 1 ? 'Liked verse' : 'Liked verses';
}

// Backup and help cover the whole app, so they share one sheet, opened from Reflections and Liked.
const help = document.getElementById('help');
document.getElementById('helpButton').addEventListener('click', async () => {
  await closeSheet(backup);
  help.showModal();
});

for (const button of document.querySelectorAll('.you-button')) {
  button.addEventListener('click', () => {
    updateStats();
    updateBackupStatus();
    prepareBackup();
    backup.showModal();
  });
}

function backedUp(count, likes) {
  localStorage.setItem(LAST_BACKUP, String(Date.now()));
  localStorage.setItem(LAST_BACKUP_COUNT, String(count));
  localStorage.setItem(LAST_BACKUP_LIKES, String(likes));
  shrinkAccepted = false;
  updateBackupStatus();
  updateBackupReminder();
  closeSheet(backup);
  toast(`Backed up ${contents(count, likes)}`);
}

backupNow.addEventListener('click', shareBackup);
bannerBackup.addEventListener('click', shareBackup);

/**
 * Set once the person agrees to a backup that may hold less than the file it replaces: fewer
 * reflections or likes than the last one, or a first backup on this phone, where the last one's
 * size is unknown (a reinstall or a new phone loses that record along with the data).
 */
let shrinkAccepted = false;
/** A backup was restored since launch, so a first backup already holds what the file had. */
let restored = false;

/** Why this backup could drop something the saved file has, or null. */
function shrinkWarning(count, likes) {
  if (!localStorage.getItem(LAST_BACKUP)) {
    if (restored) return null;
    return "This phone hasn't made a backup before. If you have an earlier one, Restore it first: "
      + 'saving this backup in the same place replaces it. Back up anyway?';
  }
  const lastCount = Number(localStorage.getItem(LAST_BACKUP_COUNT));
  const lastLikes = Number(localStorage.getItem(LAST_BACKUP_LIKES));
  if (count >= lastCount && likes >= lastLikes) return null;
  return `This backup has ${contents(count, likes)}; your last one had ${contents(lastCount, lastLikes)}. Back up anyway?`;
}

async function shareBackup() {
  const file = backupReady;
  if (!file) return;
  const count = reflectionTotal();
  const likes = likeTotal();
  const warning = shrinkAccepted ? null : shrinkWarning(count, likes);
  if (warning) {
    if (!confirm(warning)) return;
    shrinkAccepted = true;
  }
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      backedUp(count, likes);
    } catch (error) {
      // Cancelling the share sheet is not a failure. Answering the warning can use up the tap
      // iOS requires for sharing; the next tap goes straight to the share sheet.
      if (error?.name === 'NotAllowedError') alert('Tap Back Up again to finish.');
      else if (error?.name !== 'AbortError') alert(`Couldn't back up: ${error?.message ?? error}`);
    }
    return;
  }
  const url = URL.createObjectURL(file);
  el('a', { href: url, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  backedUp(count, likes);
}

// Reminder: a backup is due when there are reflections or likes newer than the last backup and that
// backup is over a week old (or there has never been one). A red dot marks the Reflections tab
// and the person buttons until then; the banner can be put off for a few days.

const SNOOZED = 'backupSnoozedUntil';
const DAY_MS = 86_400_000;
const backupBannerDetail = document.getElementById('backupBannerDetail');

async function backupOverdue() {
  if (!(reflectionTotal() + likeTotal())) return false;
  const last = Number(localStorage.getItem(LAST_BACKUP));
  if (!last) return true;
  if (Date.now() - last < 7 * DAY_MS) return false;
  if ((await journal.page(last + 1, 0, 1)).length > 0) return true;
  return (await journal.marks(LIKE)).some((m) => m.createdAt > last);
}

export async function updateBackupReminder() {
  const due = await backupOverdue();
  document.documentElement.classList.toggle('backup-due', due);
  backupBanner.hidden = !due || Date.now() < Number(localStorage.getItem(SNOOZED));
  if (backupBanner.hidden) return;
  const last = Number(localStorage.getItem(LAST_BACKUP));
  const days = Math.floor((Date.now() - last) / DAY_MS);
  backupBannerDetail.textContent = last ? `Your last backup was ${days} days ago.` : "You haven't backed up yet.";
  if (tab === 'reflections') prepareBackup();
}

document.getElementById('bannerLater').addEventListener('click', () => {
  localStorage.setItem(SNOOZED, String(Date.now() + 3 * DAY_MS));
  backupBanner.hidden = true;
});

// Restore: merge only. Reflections already on the phone (same id) and verses already liked are
// left as they are.

const restoreFile = document.getElementById('restoreFile');
const plural = (n) => `${n} reflection${n === 1 ? '' : 's'}`;

async function restoreFrom(file) {
  const { reflections, likes } = readBackup(await file.text());
  const { added, skipped } = await journal.importMany(reflections);
  const likesAdded = await journal.importMarks(LIKE, likes);
  return { added, skipped: skipped + likes.length - likesAdded, likesAdded };
}

document.getElementById('restoreNow').addEventListener('click', () => restoreFile.click());

restoreFile.addEventListener('change', async () => {
  const file = restoreFile.files[0];
  restoreFile.value = ''; // picking the same file again still fires change
  if (!file) return;
  try {
    const { added, skipped, likesAdded } = await restoreFrom(file);
    restored = true;
    updateActions();
    renderReflections();
    await closeSheet(backup);
    if (added + likesAdded === 0) toast('Everything in this backup is already here');
    else toast(`Restored ${contents(added, likesAdded)}${skipped ? '; the rest was already here' : ''}`);
  } catch (error) {
    alert(error?.message ?? String(error));
  }
});
