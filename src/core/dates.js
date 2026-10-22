// Dates as the lists and captions show them. No DOM, so tests can import it.

/** Calendar days from `ms` to `now`: 0 for today, 1 for yesterday, whatever the hour. */
export function daysAgo(ms, now = Date.now()) {
  return Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000);
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const dayFormatWithYear = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Thursday, 22 October", with the year when it isn't this year. */
export function dayName(ms, now = Date.now()) {
  const date = new Date(ms);
  return (date.getFullYear() === new Date(now).getFullYear() ? dayFormat : dayFormatWithYear).format(date);
}

/** The time of day `entry` was written, in the time zone it was written in when that is known. */
export function timeOf(entry) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: entry.timeZoneID })
      .format(entry.createdAt);
  } catch {
    return new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}
