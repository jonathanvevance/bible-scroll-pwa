import { lang } from '../lang/current.js';

// Everything kept in localStorage. Each language's app stores under its own prefix, so two apps
// on one site keep separate settings; English has none, so settings saved before still read.

/** The stored settings of the app whose keys start with `prefix`. */
export function preferences(prefix, storage = localStorage) {
  const text = (name) => ({
    get: () => storage.getItem(prefix + name),
    set: (value) => storage.setItem(prefix + name, value),
    clear: () => storage.removeItem(prefix + name),
  });
  /** 0 when nothing is stored. */
  const number = (name) => {
    const t = text(name);
    return { get: () => Number(t.get()), set: (n) => t.set(String(n)), clear: t.clear };
  };
  /** `empty()` when nothing is stored or what is stored can't be read. */
  const json = (name, empty) => {
    const t = text(name);
    return {
      get: () => { try { return JSON.parse(t.get()) ?? empty(); } catch { return empty(); } },
      set: (value) => t.set(JSON.stringify(value)),
      clear: t.clear,
    };
  };
  return {
    /** The verse being read, so the app reopens there. */
    lastVerse: number('lastVerseKey'),
    /** Recently read chapters for the History menu: `{ key, time }`, newest first. */
    history: json('history', () => []),
    /** The `pinnedAt` of the History pin being read along, or 0. */
    followingPin: number('followingPin'),
    /** The Reflections tab's range: today, week, month or all. */
    reflectionsFilter: text('reflectionsFilter'),
    lastBackupAt: number('lastBackupAt'),
    /** How many reflections and likes the last backup held, to warn before a smaller one replaces it. */
    lastBackupCount: number('lastBackupCount'),
    lastBackupLikes: number('lastBackupLikes'),
    /** The backup banner stays hidden until this time. */
    backupSnoozedUntil: number('backupSnoozedUntil'),
  };
}

export const prefs = preferences(lang.storagePrefix);
