import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionLabel, eventStatus, statusLabel } from '../src/utils/eventHistory.js'

const now = new Date('2026-11-12T12:00:00Z')
const event = (changes = {}) => ({
  published: true,
  starts_at: '2026-11-12T10:00:00Z',
  ends_at: '2026-11-12T14:00:00Z',
  suspended_at: null,
  ...changes,
})

test('event history derives every supported lifecycle status', () => {
  assert.equal(eventStatus(event({ cancelled_at: '2026-11-12T11:00:00Z' }), now), 'cancelled')
  assert.equal(eventStatus(event({ suspended_at: '2026-11-12T11:00:00Z' }), now), 'suspended')
  assert.equal(eventStatus(event({ published: false }), now), 'draft')
  assert.equal(eventStatus(event({ starts_at: '2026-11-13T10:00:00Z', ends_at: '2026-11-13T14:00:00Z' }), now), 'upcoming')
  assert.equal(eventStatus(event(), now), 'active')
  assert.equal(eventStatus(event({ starts_at: '2026-11-11T10:00:00Z', ends_at: '2026-11-11T14:00:00Z' }), now), 'completed')
})

test('audit actions and statuses have readable labels', () => {
  assert.equal(actionLabel('event.suspended'), 'Event suspended')
  assert.equal(actionLabel('custom.audit_action'), 'Custom Audit_action')
  assert.equal(statusLabel('upcoming'), 'Upcoming')
})
