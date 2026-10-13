import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSession } from '../src/api/session.js'

const pair = { access: 'access', refresh: 'refresh' }
const user = { id: 1, email: 'host@example.com', roles: ['attendee', 'organizer'] }
const json = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status })

// handler(url, options) returns a Response (or a Promise of one) per request.
function setup(handler, saved = null) {
  const calls = []
  let value = saved
  const storage = { getItem: () => value, setItem: (_, next) => { value = next }, removeItem: () => { value = null } }
  const session = createSession({
    storage,
    key: 'test.session',
    request: async (url, options) => {
      calls.push({ url, ...options, auth: options.headers.Authorization })
      return handler(url, options)
    },
  })
  return { session, calls, saved: () => value }
}

test('login keeps only the token pair in storage and reports the user', async () => {
  const app = setup(() => json({ ...pair, user }))
  const seen = []
  app.session.subscribe((next) => seen.push(next))
  assert.deepEqual(await app.session.login(' host@example.com ', 'secret'), user)
  assert.deepEqual(JSON.parse(app.calls[0].body), { email: 'host@example.com', password: 'secret' })
  assert.deepEqual(JSON.parse(app.saved()), pair)
  assert.deepEqual(seen.at(-1), user)
})

test('parallel 401s share one refresh and each request is retried once', async () => {
  const app = setup((url, { headers }) => {
    if (url === '/api/auth/refresh') return json({ access: 'new', refresh: 'rotated' })
    return headers.Authorization === 'Bearer new' ? json({ ok: url }) : json({}, 401)
  }, JSON.stringify(pair))
  const results = await Promise.all([app.session.api('/me/orders'), app.session.api('/me/tickets')])
  assert.deepEqual(results, [{ ok: '/api/me/orders' }, { ok: '/api/me/tickets' }])
  assert.equal(app.calls.filter((call) => call.url === '/api/auth/refresh').length, 1)
  assert.equal(app.calls.length, 5)
  assert.deepEqual(JSON.parse(app.saved()), { access: 'new', refresh: 'rotated' })
})

test('a request is retried at most once and login errors never refresh', async () => {
  const app = setup((url) => url === '/api/auth/refresh'
    ? json({ access: 'new', refresh: 'rotated' })
    : json({ detail: 'No.' }, 401), JSON.stringify(pair))
  await assert.rejects(app.session.api('/me/orders'), { status: 401 })
  assert.deepEqual(app.calls.map((call) => call.url), ['/api/me/orders', '/api/auth/refresh', '/api/me/orders'])

  const fresh = setup(() => json({ detail: 'Bad credentials.' }, 403))
  await assert.rejects(fresh.session.login('a@example.com', 'bad'), { status: 403, message: 'Bad credentials.' })
  assert.equal(fresh.calls.length, 1)
})

test('rejected refresh token signs out; a network failure keeps the session', async () => {
  const rejected = setup(() => json({}, 401), JSON.stringify(pair))
  await assert.rejects(rejected.session.api('/me/orders'), { status: 401 })
  assert.equal(rejected.saved(), null)
  assert.equal(rejected.session.hasSession(), false)

  const offline = setup((url) => {
    if (url === '/api/auth/refresh') throw new TypeError('offline')
    return json({}, 401)
  }, JSON.stringify(pair))
  await assert.rejects(offline.session.api('/me/orders'), { status: 0 })
  assert.deepEqual(JSON.parse(offline.saved()), pair)
})

test('logout waits for a running refresh and revokes the rotated token', async () => {
  let finishRefresh
  const app = setup((url) => {
    if (url === '/api/auth/refresh') return new Promise((resolve) => { finishRefresh = resolve })
    if (url === '/api/auth/logout') return json(null, 204)
    return json({}, 401)
  }, JSON.stringify(pair))
  const pending = app.session.api('/me/orders').catch((error) => error)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const loggingOut = app.session.logout()
  finishRefresh(json({ access: 'new', refresh: 'rotated' }))
  await loggingOut
  const logoutCall = app.calls.find((call) => call.url === '/api/auth/logout')
  assert.deepEqual(JSON.parse(logoutCall.body), { refresh: 'rotated' })
  assert.equal(app.saved(), null)
  await pending
})

test('reload re-reads the user from /auth/me; later requests drop the Bearer header after logout', async () => {
  const app = setup((url) => url === '/api/auth/me' ? json(user) : json(null, 204), JSON.stringify(pair))
  assert.equal(app.session.getUser(), null)
  assert.deepEqual(await app.session.restore(), user)
  assert.equal(app.calls[0].auth, 'Bearer access')
  await app.session.logout()
  await app.session.api('/events')
  assert.equal(app.calls.at(-1).auth, undefined)
})

test('blob responses are returned as Blob for authorised images', async () => {
  const app = setup(() => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }), JSON.stringify(pair))
  const blob = await app.session.api('/tickets/1/qr', { as: 'blob' })
  assert.equal(await blob.text(), '<svg/>')
})
