import { preferences } from '../src/data/prefs.js';
import { test, eq } from './runner.js';

// A stand-in for localStorage, so tests never touch the app's own settings.
const fakeStorage = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

test('English reads the keys saved before preferences existed', () => {
  const storage = fakeStorage({
    lastVerseKey: '43003016', history: '[{"key":1001001,"time":5}]', reflectionsFilter: 'month',
    lastBackupAt: '1000', lastBackupCount: '12', lastBackupLikes: '3', backupSnoozedUntil: '2000',
  });
  const p = preferences('', storage);
  eq(p.lastVerse.get(), 43_003_016, 'lastVerse');
  eq(p.history.get(), [{ key: 1_001_001, time: 5 }], 'history');
  eq(p.reflectionsFilter.get(), 'month', 'reflectionsFilter');
  eq(p.lastBackupAt.get(), 1000, 'lastBackupAt');
  eq(p.lastBackupCount.get(), 12, 'lastBackupCount');
  eq(p.lastBackupLikes.get(), 3, 'lastBackupLikes');
  eq(p.backupSnoozedUntil.get(), 2000, 'backupSnoozedUntil');
});

test('nothing stored: numbers are 0, text is null, history is empty', () => {
  const p = preferences('', fakeStorage());
  eq(p.lastVerse.get(), 0, 'number');
  eq(p.reflectionsFilter.get(), null, 'text');
  eq(p.history.get(), [], 'json');
});

test('unreadable history counts as empty, and each read is a fresh list', () => {
  const p = preferences('', fakeStorage({ history: '{not json' }));
  eq(p.history.get(), [], 'broken');
  p.history.get().push(1);
  eq(p.history.get(), [], 'not shared');
});

test('a prefix keeps two apps apart on one site', () => {
  const storage = fakeStorage();
  const en = preferences('', storage);
  const ml = preferences('ml.', storage);
  en.lastVerse.set(1_001_001);
  ml.lastVerse.set(19_023_001);
  ml.history.set([{ key: 19_023_001, time: 1 }]);
  eq(en.lastVerse.get(), 1_001_001, 'English');
  eq(ml.lastVerse.get(), 19_023_001, 'Malayalam');
  eq(en.history.get(), [], 'English history untouched');
  eq([...storage.map.keys()].sort(), ['lastVerseKey', 'ml.history', 'ml.lastVerseKey'], 'stored keys');
  ml.history.clear();
  eq(storage.map.has('ml.history'), false, 'clear removes the key');
});
