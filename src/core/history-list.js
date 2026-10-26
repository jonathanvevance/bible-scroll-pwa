// The History list's rules, with no DOM. Entries are { key, time, pinnedAt? }, stored newest
// first, one per chapter. Pinned entries are never displaced; only unpinned ones roll off.
// A pin is a reading track. Only the track being read (followed) ever moves: to wherever the
// reader scrolls on to, in any chapter. Every other pin stays exactly where it was left.

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

/**
 * Records leaving `key` at `time`. The pin being followed (its `pinnedAt`) moves to `key`, and
 * unpinned entries stay, except one for that very verse. Otherwise `key` is an unpinned entry,
 * and an unpinned entry for the same chapter gives way to it.
 */
export function remember(list, key, time, following = null) {
  const followed = following != null && list.find((h) => h.pinnedAt === following);
  const replaced = followed ? (h) => h.key === key : (h) => chapterOf(h.key) === chapterOf(key);
  const entry = { key, time, ...(followed ? { pinnedAt: followed.pinnedAt } : {}) };
  return trim([entry, ...list.filter((h) => h !== followed && !(!isPinned(h) && replaced(h)))]);
}

/** Whether `following` names a pin that is still in `list`. */
export const isFollowing = (list, following) => following != null && list.some((h) => h.pinnedAt === following);

/**
 * Pins or unpins `key`; pass `pinnedAt` (null for unpinned) when a pin and another entry may
 * share the verse. Returns null when it can't be pinned because the pins are full.
 */
export function togglePin(list, key, time, pinnedAt) {
  const entry = list.find((h) => h.key === key && (pinnedAt === undefined || (h.pinnedAt ?? null) === pinnedAt));
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
