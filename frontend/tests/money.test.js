import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTenge } from '../src/utils/money.js'

test('tenge input becomes exact integer tiyn', () => {
  assert.equal(parseTenge('2500'), 250000)
  assert.equal(parseTenge('2 500,5'), 250050)
  assert.equal(parseTenge('0.29'), 29) // 0.29 * 100 is 28.999999999999996 in floating point
  assert.equal(parseTenge('19.99'), 1999)
  assert.equal(parseTenge('0'), 0)
})

test('anything that is not a price is rejected', () => {
  for (const value of ['', '-5', '1.234', 'abc', '1e3', '12345678']) assert.equal(parseTenge(value), null)
})
