import { HISTORY_SIZE, MAX_PINS, ordered, pinCount, remember, togglePin, withoutUnpinned } from '../src/core/history-list.js';
import { test, eq, ok } from './runner.js';

const verse = (book, chapter, v = 1) => book * 1_000_000 + chapter * 1_000 + v;
/** Leaves chapters 1..n of Genesis in turn, at times 1..n. */
const visits = (n, list = []) => Array.from({ length: n }, (_, i) => i + 1).reduce((l, c) => remember(l, verse(1, c), c), list);

test('history: six at most, newest first, one per chapter', () => {
  const list = visits(8);
  eq(list.length, HISTORY_SIZE, 'six kept');
  eq(list.map((h) => h.key), [8, 7, 6, 5, 4, 3].map((c) => verse(1, c)), 'newest first');
  const again = remember(list, verse(1, 5, 9), 20);
  eq(again.filter((h) => h.key === verse(1, 5, 9) || h.key === verse(1, 5)).length, 1, 'one entry for chapter 5');
  eq(again[0].key, verse(1, 5, 9), 'moved to the top at the new verse');
});

test('history: pins are never displaced', () => {
  let list = visits(3);
  list = togglePin(list, verse(1, 1), 100);
  list = visits(10, list).map((h) => h); // ten more places
  ok(list.some((h) => h.key === verse(1, 1) && h.pinnedAt === 100), 'pinned chapter 1 still there');
  eq(list.length, HISTORY_SIZE, 'still six in all');
});

test('history: at most three pins; a fourth is refused', () => {
  let list = visits(6);
  for (const c of [1, 2, 3]) list = togglePin(list, verse(1, c), c * 10);
  eq(pinCount(list), MAX_PINS, 'three pinned');
  eq(togglePin(list, verse(1, 4), 99), null, 'fourth refused');
  list = togglePin(list, verse(1, 2), 0);
  eq(pinCount(list), 2, 'unpinned one');
  ok(togglePin(list, verse(1, 4), 99), 'now the fourth place can be pinned');
});

test('history: pins first in the order pinned, then newest first', () => {
  let list = visits(6);
  list = togglePin(list, verse(1, 2), 50);
  list = togglePin(list, verse(1, 5), 40);
  eq(ordered(list).map((h) => h.key), [5, 2, 6, 4, 3, 1].map((c) => verse(1, c)), 'order');
});

test('history: only the followed pin moves; reading a pinned chapter off its track leaves the pin', () => {
  let list = togglePin(visits(3), verse(1, 2), 70);
  const followed = remember(list, verse(1, 2, 30), 80, 70);
  eq(followed.find((h) => h.pinnedAt === 70)?.key, verse(1, 2, 30), 'followed: same pin, new verse');
  list = remember(list, verse(1, 2, 30), 80);
  eq(list.find((h) => h.pinnedAt === 70)?.key, verse(1, 2), 'not followed: the pin stays put');
  ok(list.some((h) => h.key === verse(1, 2, 30) && h.pinnedAt == null), 'and the visit is its own entry');
});

test('history: following one pin into another pin\'s chapter leaves the other pin alone', () => {
  let list = togglePin(togglePin(visits(3), verse(1, 2), 70), verse(1, 3), 71);
  list = remember(list, verse(1, 3, 9), 80, 70);
  eq(list.find((h) => h.pinnedAt === 70)?.key, verse(1, 3, 9), 'the followed pin moved');
  eq(list.find((h) => h.pinnedAt === 71)?.key, verse(1, 3), 'the other pin did not');
  eq(pinCount(list), 2, 'no pin lost');
});

test('history: togglePin picks the pinned or unpinned entry when both share a verse', () => {
  const list = [{ key: verse(1, 3), time: 9 }, { key: verse(1, 3), time: 1, pinnedAt: 5 }];
  const unpinned = togglePin(list, verse(1, 3), 10, 5);
  eq(pinCount(unpinned), 0, 'unpinned the pin, not the visit');
  eq(pinCount(togglePin(list, verse(1, 3), 10, null)), 2, 'pinned the visit');
});

test('history: a followed pin moves to whichever chapter the reader scrolled on to', () => {
  let list = togglePin(visits(3), verse(1, 2), 70);
  list = remember(list, verse(1, 1, 5), 80, 70); // read back from Genesis 2 into Genesis 1
  const pins = list.filter((h) => h.pinnedAt === 70);
  eq(pins.map((h) => h.key), [verse(1, 1, 5)], 'the pin is now at Genesis 1:5');
  ok(!list.some((h) => h.key === verse(1, 2)), 'Genesis 2 is no longer listed');
  ok(list.some((h) => h.key === verse(1, 1) && h.pinnedAt == null), 'the Genesis 1:1 visit stays');
  eq(list.length, 3, 'no new entry');
});

test('history: a verse looked up in the track\'s chapter stays when the track is opened again', () => {
  let list = togglePin(remember([], verse(20, 8), 1), verse(20, 8), 70); // pinned Proverbs 8:1
  list = remember(list, verse(20, 8, 1), 2, 70); // on the track, then the Jump sheet to 8:15
  list = remember(list, verse(20, 8, 15), 3); // off the track at 8:15, then the pin is tapped
  ok(list.some((h) => h.key === verse(20, 8, 15) && h.pinnedAt == null), '8:15 recorded');
  const reading = remember(list, verse(20, 8, 4), 4, 70); // reading on the track again
  ok(reading.some((h) => h.key === verse(20, 8, 15) && h.pinnedAt == null), '8:15 still listed');
  eq(reading.find((h) => h.pinnedAt === 70)?.key, verse(20, 8, 4), 'the track moved on');
  eq(remember(list, verse(20, 8, 15), 5, 70).filter((h) => h.key === verse(20, 8, 15)).length, 1, 'the same verse is never listed twice');
});

test('history: without following, a new chapter is a new entry and the pin stays', () => {
  let list = togglePin(visits(3), verse(1, 2), 70);
  list = remember(list, verse(1, 4), 80);
  ok(list.some((h) => h.key === verse(1, 2) && h.pinnedAt === 70), 'pin unchanged');
  ok(list.some((h) => h.key === verse(1, 4) && h.pinnedAt == null), 'Genesis 4 added, unpinned');
  ok(remember(list, verse(1, 5), 90, 999).some((h) => h.pinnedAt === 70 && h.key === verse(1, 2)), 'following a removed pin changes nothing');
});

test('history: Clear History keeps the pins', () => {
  const list = togglePin(visits(4), verse(1, 3), 5);
  eq(withoutUnpinned(list).map((h) => h.key), [verse(1, 3)], 'only the pin');
});

test('history: entries saved before pinning still read', () => {
  const old = [{ key: verse(1, 1), time: 5 }];
  eq(ordered(old), old, 'unchanged');
  eq(remember(old, verse(1, 2), 6).length, 2, 'new place added');
});
