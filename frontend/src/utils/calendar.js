// Calendar export (SRS bonus): an .ics file for any calendar app and a
// prefilled Google Calendar link. Times are always sent in UTC, so the
// calendar shows them in the viewer's own time zone.

// 2026-11-20T19:00:00+05:00 -> 20261120T140000Z
export function icsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// RFC 5545 TEXT: escape \ ; , and newlines.
export function icsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// RFC 5545 3.1: lines longer than 75 octets continue on a line starting
// with a space. Cut on code points so Cyrillic/emoji are never split.
export function foldLine(line) {
  const encoder = new TextEncoder()
  const parts = []
  let current = ''
  let size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74 // the leading space counts
    if (size + bytes > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += bytes
  }
  parts.push(current)
  return parts.join('\r\n ')
}

// One VEVENT. `url` is the public event page; `now` is injectable for tests.
export function buildIcs(event, url, now = new Date()) {
  const description = [event.description, url].filter(Boolean).join('\n\n')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Begemot//BiletFlow//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@biletflow`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(event.starts_at)}`,
    `DTEND:${icsDate(event.ends_at)}`,
    `SUMMARY:${icsText(event.title)}`,
    `LOCATION:${icsText(event.venue)}`,
    `DESCRIPTION:${icsText(description)}`,
    ...(url ? [`URL:${url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function icsFilename(event) {
  const slug = String(event.title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || `event-${event.id}`}.ics`
}

export function googleCalendarUrl(event, url) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title ?? '',
    dates: `${icsDate(event.starts_at)}/${icsDate(event.ends_at)}`,
    location: event.venue ?? '',
    details: [event.description, url].filter(Boolean).join('\n\n').slice(0, 1500),
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
