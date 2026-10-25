// The History list's rules, with no DOM. Entries are { key, time, pinnedAt? }, stored newest
// first, one per chapter. Pinned entries are never displaced; only unpinned ones roll off.

export const HISTORY_SIZE = 6;
export const MAX_PINS = 3;

export const chapterOf = (key) => Math.floor(key / 1_000) * 1_000;
export const isPinned = (h) => h.pinnedAt != null;
export const pinCount = (list) => list.filter(isPinned).length;

/** Keeps every pin and the newest unpinned entries that fit. */
function trim(list) {
  let room = HISTORY_SIZE - pinCount(list);
  return list.filter((h) => isPinned(h) || room-- > 0);
}

/** Records leaving `key` at `time`. A pinned chapter keeps its pin and moves to the new verse. */
export function remember(list, key, time) {
  const old = list.find((h) => chapterOf(h.key) === chapterOf(key));
  const entry = { key, time, ...(old && isPinned(old) ? { pinnedAt: old.pinnedAt } : {}) };
  return trim([entry, ...list.filter((h) => h !== old)]);
}

/** Pins or unpins `key`. Returns null when it can't be pinned because the pins are full. */
export function togglePin(list, key, time) {
  const entry = list.find((h) => h.key === key);
  if (!entry) return list;
  if (isPinned(entry)) {
    const { pinnedAt, ...rest } = entry;
    return list.map((h) => (h === entry ? rest : h));
  }
  if (pinCount(list) >= MAX_PINS) return null;
  return list.map((h) => (h === entry ? { ...h, pinnedAt: time } : h));
}

/** Pins first, in the order they were pinned; then the rest, newest first. */
export function ordered(list) {
  const pins = list.filter(isPinned).sort((a, b) => a.pinnedAt - b.pinnedAt);
  return [...pins, ...list.filter((h) => !isPinned(h))];
}

/** What Clear History leaves: the pins. */
export const withoutUnpinned = (list) => list.filter(isPinned);
