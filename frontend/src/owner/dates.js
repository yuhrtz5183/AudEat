// The API sends calendar dates as 'YYYY-MM-DD'. Formatting them in UTC keeps the day the
// API meant, whatever the browser's time zone.
const CALENDAR_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const LOCAL_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

/** '2026-11-04' → "Nov 4, 2026". */
export function formatDate(date) {
  const [year, month, day] = date.split('-').map(Number)
  return CALENDAR_DATE.format(new Date(Date.UTC(year, month - 1, day)))
}

/** An instant such as '2026-11-04T15:00:00Z' → the day it was in the user's time zone. */
export function formatInstantDate(instant) {
  return LOCAL_DATE.format(new Date(instant))
}
