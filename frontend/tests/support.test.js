import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caseContext, caseHeader, isSupportSide, mergeMessages, statusLabel } from '../src/utils/support.js'

test('only the most specific valid link is sent when opening a case', () => {
  assert.deepEqual(caseContext(new URLSearchParams('ticket=5&order=3&event=2')), { ticket: 5 })
  assert.deepEqual(caseContext(new URLSearchParams('order=3&event=2')), { order: 3 })
  assert.deepEqual(caseContext(new URLSearchParams('event=2')), { event: 2 })
  assert.deepEqual(caseContext(new URLSearchParams('ticket=abc&order=0&event=-1')), {})
  assert.deepEqual(caseContext(new URLSearchParams('ticket=1e3&order=7')), { order: 7 })
  assert.deepEqual(caseContext(new URLSearchParams('')), {})
})

test('polled messages are merged without duplicates, oldest first', () => {
  const thread = [{ id: 1, body: 'hi' }, { id: 3, body: 'mine' }]
  const merged = mergeMessages(thread, [{ id: 3, body: 'mine' }, { id: 4, body: 'reply' }, { id: 2, body: 'late' }])
  assert.deepEqual(merged.map((m) => m.id), [1, 2, 3, 4])
  assert.deepEqual(mergeMessages(thread, []), thread)
})

test('case header drops the thread and keeps the rest', () => {
  const detail = { id: 9, status: 'open', messages: [{ id: 1 }] }
  assert.deepEqual(caseHeader(detail), { id: 9, status: 'open' })
  assert.equal(detail.messages.length, 1) // the API answer itself is not changed
})

test('the requester sees "waiting for customer" as a request to reply', () => {
  const supportCase = { requester: 7 }
  assert.equal(isSupportSide(supportCase, { id: 7 }), false)
  assert.equal(isSupportSide(supportCase, { id: 2 }), true)
  assert.equal(statusLabel('waiting_for_customer', false), 'Waiting for your reply')
  assert.equal(statusLabel('waiting_for_customer', true), 'Waiting for customer')
  assert.equal(statusLabel('resolved', false), 'Resolved')
  assert.equal(statusLabel('something_new', true), 'something_new')
})
