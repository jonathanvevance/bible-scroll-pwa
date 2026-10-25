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

test('history: a pinned chapter keeps its pin when left again at another verse', () => {
  let list = togglePin(visits(3), verse(1, 2), 70);
  list = remember(list, verse(1, 2, 30), 80);
  const entry = list.find((h) => h.key === verse(1, 2, 30));
  eq(entry?.pinnedAt, 70, 'same pin, new verse');
  eq(list.filter((h) => Math.floor(h.key / 1_000) === Math.floor(verse(1, 2) / 1_000)).length, 1, 'one entry');
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
