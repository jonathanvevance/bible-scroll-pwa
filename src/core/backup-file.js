// Reading a backup file. No DOM, so tests can import it.

import { unpackKey } from './references.js';

export const BACKUP_FORMAT = 1;

/** The backup's reflections and likes, checked in full first so a bad file writes nothing. */
export function readBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (data?.app !== 'Bible Scroll' || !Array.isArray(data.reflections)) {
    throw new Error("This file isn't a Bible Scroll backup.");
  }
  if (!Number.isInteger(data.format) || data.format < 1) throw new Error("This file isn't a Bible Scroll backup.");
  if (data.format > BACKUP_FORMAT) throw new Error('This backup was made by a newer version of the app. Update the app, then try again.');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Backups made before likes existed have none.
  if (data.likes !== undefined && !Array.isArray(data.likes)) throw new Error('The likes in this backup are damaged, so nothing was restored.');
  const likes = (data.likes ?? []).map((l, i) => {
    const valid = Number.isInteger(l?.verseKey) && unpackKey(l.verseKey) !== null && Number.isFinite(l.createdAt);
    if (!valid) throw new Error(`Liked verse ${i + 1} in this backup is damaged, so nothing was restored.`);
    return { verseKey: l.verseKey, createdAt: l.createdAt };
  });
  const reflections = data.reflections.map((r, i) => {
    const valid = typeof r?.id === 'string' && r.id !== ''
      && Number.isInteger(r.verseKey) && unpackKey(r.verseKey) !== null
      && typeof r.body === 'string' && r.body.trim() !== ''
      && Number.isFinite(r.createdAt);
    if (!valid) throw new Error(`Reflection ${i + 1} in this backup is damaged, so nothing was restored.`);
    return {
      id: r.id,
      verseKey: r.verseKey,
      body: r.body,
      createdAt: r.createdAt,
      timeZoneID: typeof r.timeZoneID === 'string' ? r.timeZoneID : zone,
      updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt : null,
    };
  });
  return { reflections, likes };
}
