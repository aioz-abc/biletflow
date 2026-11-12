import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actionPath, attendeeCanCancel, confirmText } from '../src/utils/orders.js'

test('actionPath follows the action the API allows', () => {
  assert.equal(actionPath({ id: 7, action: 'refund' }), '/orders/7/refund')
  assert.equal(actionPath({ id: 8, action: 'cancel' }), '/orders/8/cancel')
  assert.equal(actionPath({ id: 9, action: null }), null)
  assert.equal(actionPath({ id: 9, action: 'delete' }), null)
})

test('confirmText names the amount and the tickets', () => {
  assert.match(confirmText({ action: 'refund', total_minor: 1440000, tickets: 2 }), /Refund 14\s?400,00.*2 tickets/)
  assert.match(confirmText({ action: 'cancel', total_minor: 0, tickets: 1 }), /registration.*1 ticket\?/)
})

test('attendeeCanCancel only for confirmed orders that cost nothing', () => {
  assert.equal(attendeeCanCancel({ status: 'confirmed', total_minor: 0 }), true)
  assert.equal(attendeeCanCancel({ status: 'confirmed', total_minor: 500 }), false)
  assert.equal(attendeeCanCancel({ status: 'cancelled', total_minor: 0 }), false)
  assert.equal(attendeeCanCancel({ status: 'pending', total_minor: 0 }), false)
})
