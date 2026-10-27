/*
 * Plans are stored as UTC milliseconds and shown in whichever time zone the
 * phone looking at them is in, so "6 pm" in Kansas reads as the matching
 * local hour in Nairobi.
 */

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return ''
  }
}

/** "Today 6:00 PM CDT", "Tomorrow 9:30 AM EAT", "Sat, Nov 1 6:00 PM CDT". */
export function formatWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const today = new Date(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(today.getDate() + 1)
  const day = d.toDateString() === today.toDateString()
    ? 'Today'
    : d.toDateString() === tomorrow.toDateString()
      ? 'Tomorrow'
      : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  return `${day} ${time}`
}

/** "in 25 min", "in 2 h 10 min", "in 3 days", "20 min ago". */
export function relativeWhen(ms: number, now = Date.now()): string {
  const diff = ms - now
  const mins = Math.round(Math.abs(diff) / 60000)
  if (mins < 1) return 'now'
  const text = mins < 60
    ? `${mins} min`
    : mins < 24 * 60
      ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`
      : `${Math.round(mins / (24 * 60))} day${Math.round(mins / (24 * 60)) === 1 ? '' : 's'}`
  return diff < 0 ? `${text} ago` : `in ${text}`
}

/** The value a datetime-local input wants, in local time. */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
