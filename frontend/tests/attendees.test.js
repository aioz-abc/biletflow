import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attendeesPayload, holderKeys } from '../src/utils/attendees.js'

const items = [{ ticket_type: 7, quantity: 2 }, { ticket_type: 9, quantity: 1 }]

test('holderKeys gives one field per ticket', () => {
  assert.deepEqual(holderKeys(items).map((h) => h.key), ['7-0', '7-1', '9-0'])
})

test('attendeesPayload keeps only typed names, trimmed', () => {
  assert.deepEqual(attendeesPayload(items, { '7-1': '  Dana ', '9-0': '' }), [{ ticket_type: 7, name: 'Dana' }])
  assert.deepEqual(attendeesPayload(items, {}), [])
})
