import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAdminAuth } from '../src/mirat/adminAuth.js'

const admin = { email: 'admin@example.com', roles: ['attendee', 'platform_admin'] }
const pair = { access: 'access', refresh: 'refresh' }
function setup(responses, saved = null) {
  const calls = []
  let value = saved
  const storage = { getItem: () => value, setItem: (_, next) => { value = next }, removeItem: () => { value = null } }
  const auth = createAdminAuth(storage, async (url, options) => {
    calls.push({ url, ...options })
    const response = responses.shift()
    if (response instanceof Error) throw response
    assert.ok(response, `Unexpected request: ${url}`)
    return new Response(response.status === 204 ? null : JSON.stringify(response.body), { status: response.status || 200 })
  })
  return { auth, calls, saved: () => value }
}
test('login verifies server role; password never enters storage; logout revokes refresh', async () => {
  const app = setup([{ body: pair }, { body: admin }, { status: 204 }])
  assert.deepEqual(await app.auth.login(' admin@example.com ', 'secret'), admin)
  assert.deepEqual(JSON.parse(app.calls[0].body), { email: 'admin@example.com', password: 'secret' })
  assert.deepEqual(JSON.parse(app.saved()), pair)
  assert.equal(app.calls[1].headers.Authorization, 'Bearer access')
  await app.auth.logout()
  assert.equal(app.saved(), null)
  assert.equal(app.calls[2].url, '/api/auth/logout')
})
test('rejects attendee, organizer and event admin even when login claims platform admin', async () => {
  for (const role of ['attendee', 'organizer', 'event_admin']) {
    const app = setup([{ body: { ...pair, user: admin } }, { body: { roles: [role] } }, { status: 204 }])
    await assert.rejects(app.auth.login('user@example.com', 'secret'), { status: 403 })
    assert.equal(app.saved(), null)
  }
})
test('reload validates role and concurrent restoration rotates expired access only once', async () => {
  const app = setup([{ status: 401 }, { body: { access: 'new', refresh: 'rotated' } }, { body: admin }], JSON.stringify(pair))
  const users = await Promise.all([app.auth.restore(), app.auth.restore()])
  assert.deepEqual(users, [admin, admin])
  assert.equal(app.calls.length, 3)
  assert.equal(app.calls[1].url, '/api/auth/refresh')
  assert.equal(app.calls[2].headers.Authorization, 'Bearer new')
  assert.equal(JSON.parse(app.saved()).refresh, 'rotated')
})
test('expired refresh clears session and does not retry indefinitely', async () => {
  const app = setup([{ status: 401 }, { status: 401 }], JSON.stringify(pair))
  await assert.rejects(app.auth.restore(), { status: 401 })
  assert.equal(app.saved(), null)
  assert.equal(await app.auth.restore(), null)
})
test('network failures are retryable; failed logout still removes local credentials', async () => {
  const app = setup([new Error('offline'), { body: admin }, new Error('offline')], JSON.stringify(pair))
  await assert.rejects(app.auth.restore(), /сервером/)
  assert.ok(app.saved())
  assert.deepEqual(await app.auth.restore(), admin)
  await assert.rejects(app.auth.logout(), /сервером/)
  assert.equal(app.saved(), null)
})
test('invalid credentials, rate limiting and malformed storage fail safely', async () => {
  for (const status of [401, 429, 503]) {
    const app = setup([{ status }], '{broken')
    assert.equal(await app.auth.restore(), null)
    await assert.rejects(app.auth.login('a@example.com', 'bad'), { status })
    assert.equal(app.saved(), null)
  }
})
test('a pending session check cannot sign the user back in after logout', async () => {
  let resolveMe
  let saved = JSON.stringify(pair)
  const auth = createAdminAuth({ getItem: () => saved, setItem: (_, value) => { saved = value }, removeItem: () => { saved = null } }, (url) => {
    if (url.endsWith('/me')) return new Promise(resolve => { resolveMe = resolve })
    return Promise.resolve(new Response(null, { status: 204 }))
  })
  const pending = auth.restore()
  await auth.logout()
  resolveMe(new Response(JSON.stringify(admin)))
  assert.equal(await pending, null)
  assert.equal(saved, null)
})
