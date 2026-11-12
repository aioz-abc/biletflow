import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseResetCode } from '../src/utils/resetCode.js'

test('reset code is read from the pasted email text', () => {
  const email = 'Subject: BiletFlow password reset\n\nuid=MTI\ntoken=12:0b9c1e2a-77aa-4c1b-9d55-6f1c2b3a4d5e:1tAbCd:Xy_z-12AB\n'
  assert.deepEqual(parseResetCode(email), {
    uid: 'MTI',
    token: '12:0b9c1e2a-77aa-4c1b-9d55-6f1c2b3a4d5e:1tAbCd:Xy_z-12AB',
  })
  assert.equal(parseResetCode('uid=MTI'), null)
  assert.equal(parseResetCode('token=abc'), null)
  assert.equal(parseResetCode(''), null)
})
