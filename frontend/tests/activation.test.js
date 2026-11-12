import assert from 'node:assert/strict'
import { test } from 'node:test'
import { missingBeforeFee, payoutReferenceError } from '../src/utils/activation.js'

test('missingBeforeFee lists open steps except the fee', () => {
  const state = {
    checklist: [
      { step: 'paid_ticket_type', done: true },
      { step: 'identity_verified', done: false },
      { step: 'payout_account', done: true },
      { step: 'terms_accepted', done: false },
      { step: 'fee_paid', done: false },
    ],
  }
  assert.deepEqual(missingBeforeFee(state), ['identity_verified', 'terms_accepted'])
})

test('payoutReferenceError refuses blanks and real-looking numbers', () => {
  assert.equal(payoutReferenceError('SIM-PAYOUT-1'), null)
  assert.match(payoutReferenceError('  '), /simulated/)
  assert.match(payoutReferenceError('4400 4301 2345 6789'), /real account/)
})
