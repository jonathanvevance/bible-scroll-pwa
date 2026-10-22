import { daysAgo, dayName, timeOf } from '../src/core/dates.js';
import { test, eq, ok } from './runner.js';
import { realBible } from './bible.js';

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('daysAgo counts calendar days, not 24-hour spans', () => {
  const now = at(2026, 10, 22, 0, 5);
  eq(daysAgo(at(2026, 10, 22, 0, 1), now), 0, 'earlier today');
  eq(daysAgo(at(2026, 10, 21, 23, 59), now), 1, 'a few minutes ago, before midnight');
  eq(daysAgo(at(2026, 10, 15, 23, 59), now), 7, 'a week');
  eq(daysAgo(at(2026, 3, 1), at(2026, 3, 31)), 30, 'across a daylight-saving change');
});

test('dayName shows the year only for other years', () => {
  const now = at(2026, 10, 22);
  ok(!dayName(at(2026, 1, 5), now).includes('2026'), 'this year');
  ok(dayName(at(2025, 12, 31), now).includes('2025'), 'last year');
  eq(dayName(at(2026, 10, 22, 1), now), dayName(at(2026, 10, 22, 23), now), 'one name for the whole day');
});

test('timeOf uses the time zone the entry was written in', () => {
  const createdAt = Date.UTC(2026, 9, 22, 3, 30);
  const format = (timeZone) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(createdAt);
  eq(timeOf({ createdAt, timeZoneID: 'Asia/Kolkata' }), format('Asia/Kolkata'), 'Kolkata');
  eq(timeOf({ createdAt, timeZoneID: 'America/New_York' }), format('America/New_York'), 'New York');
  eq(timeOf({ createdAt, timeZoneID: 'Not/AZone' }), new Date(createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'unknown zone falls back to local time');
});

test('Bible#text: the verse for a packed key, null when there is none', async () => {
  const bible = await realBible();
  ok(bible.text(1_001_001).startsWith('In the beginning'), 'Genesis 1:1');
  ok(bible.text(43_003_016).includes('God so loved the world'), 'John 3:16');
  eq(bible.text(1_001_999), null, 'no such verse');
  eq(bible.text(99_001_001), null, 'no such book');
  eq(bible.text(0), null, 'not a key');
});
