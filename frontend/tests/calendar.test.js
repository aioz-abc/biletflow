import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIcs, foldLine, googleCalendarUrl, icsDate, icsFilename, icsText } from '../src/utils/calendar.js'

const event = {
  id: 7,
  title: 'Jazz, Blues; and More',
  venue: 'Almaty Opera, Hall 2',
  description: 'Line one\nLine two',
  starts_at: '2026-11-20T19:00:00+05:00',
  ends_at: '2026-11-20T22:30:00+05:00',
}

test('dates are converted to UTC basic format', () => {
  assert.equal(icsDate('2026-11-20T19:00:00+05:00'), '20261120T140000Z')
  assert.equal(icsDate('2026-01-01T00:00:00.123Z'), '20260101T000000Z')
})

test('text values escape commas, semicolons, backslashes and newlines', () => {
  assert.equal(icsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
  assert.equal(icsText(null), '')
})

test('long lines are folded at 75 octets without splitting characters', () => {
  const folded = foldLine(`SUMMARY:${'Ж'.repeat(80)}`)
  const encoder = new TextEncoder()
  for (const line of folded.split('\r\n')) assert.ok(encoder.encode(line).length <= 75)
  assert.equal(folded.replace(/\r\n /g, ''), `SUMMARY:${'Ж'.repeat(80)}`)
  assert.equal(foldLine('SHORT:1'), 'SHORT:1')
})

test('the .ics file has one event with escaped fields and CRLF endings', () => {
  const ics = buildIcs(event, 'https://biletflow.test/events/7', new Date('2026-11-12T10:00:00Z'))
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'))
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'))
  assert.match(ics, /\r\nUID:event-7@biletflow\r\n/)
  assert.match(ics, /\r\nDTSTAMP:20261112T100000Z\r\n/)
  assert.match(ics, /\r\nDTSTART:20261120T140000Z\r\nDTEND:20261120T173000Z\r\n/)
  assert.match(ics, /\r\nSUMMARY:Jazz\\, Blues\\; and More\r\n/)
  assert.match(ics, /\r\nLOCATION:Almaty Opera\\, Hall 2\r\n/)
  assert.match(ics.replace(/\r\n /g, ''), /DESCRIPTION:Line one\\nLine two\\n\\nhttps:\/\/biletflow.test\/events\/7/)
  assert.equal(ics.split('\n').filter((l) => !l.endsWith('\r') && l !== '').length, 0)
})

test('file names are safe slugs with a fallback', () => {
  assert.equal(icsFilename(event), 'jazz-blues-and-more.ics')
  assert.equal(icsFilename({ id: 3, title: 'Джаз' }), 'event-3.ics')
})

test('the Google Calendar link carries title, UTC dates and venue', () => {
  const url = new URL(googleCalendarUrl(event, 'https://biletflow.test/events/7'))
  assert.equal(url.host, 'calendar.google.com')
  assert.equal(url.searchParams.get('action'), 'TEMPLATE')
  assert.equal(url.searchParams.get('text'), event.title)
  assert.equal(url.searchParams.get('dates'), '20261120T140000Z/20261120T173000Z')
  assert.equal(url.searchParams.get('location'), event.venue)
  assert.ok(url.searchParams.get('details').endsWith('https://biletflow.test/events/7'))
})
