import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campaignPayload, createCampaignApi } from '../src/mirat/campaignApi.js'
const form = { name: ' Launch ', discount_type: 'percent', discount_value: '10', starts_at: '2026-11-01T12:00', ends_at: '2026-11-03T12:00', max_redemptions: '25', ticket_types: ['7'] }
const pair = { access: 'old', refresh: 'refresh' }
const organizer = { roles: ['attendee', 'organizer'] }
function mock(responses, initial = null) {
  let stored = initial
  const calls = []
  const api = createCampaignApi({ getItem: () => stored, setItem: (_, value) => { stored = value }, removeItem: () => { stored = null } }, async (url, options) => {
    calls.push({ url, ...options })
    const response = responses.shift()
    assert.ok(response, `Unexpected request ${url}`)
    if (response instanceof Error) throw response
    const body = response.status === 204 ? null : response.raw ?? JSON.stringify(response.body)
    return new Response(body, { status: response.status || 200, headers: response.headers })
  })
  return { api, calls, stored: () => stored }
}
test('campaign payload converts dates and sends only writable fields', () => {
  assert.deepEqual(campaignPayload(form, [7]), { name: 'Launch', discount_type: 'percent', discount_value: 10, starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(), max_redemptions: 25, ticket_types: [7], enabled: true })
})
test('fixed discount uses exact tiyn; blank limit and selection mean unlimited and all types', () => {
  const value = campaignPayload({ ...form, discount_type: 'fixed', discount_value: '19.99', max_redemptions: '', ticket_types: [] }, [])
  assert.equal(value.discount_value, 1999)
  assert.equal(value.max_redemptions, null)
  assert.deepEqual(value.ticket_types, [])
  assert.equal(campaignPayload({ ...form, discount_type: 'fixed', discount_value: '0.01' }, [7]).discount_value, 1)
})
test('rejects invalid amounts, dates, limits, names and foreign ticket types', () => {
  for (const change of [{ name: ' ' }, { discount_value: '101' }, { discount_value: '0' }, { discount_value: '1.5' }, { discount_type: 'fixed', discount_value: '1.001' }, { ends_at: form.starts_at }, { starts_at: 'bad' }, { max_redemptions: '-1' }, { max_redemptions: '1.5' }, { max_redemptions: '2147483648' }, { ticket_types: ['99'] }]) {
    assert.throws(() => campaignPayload({ ...form, ...change }, [7]), Error)
  }
})
test('login checks server role and stores tokens only', async () => {
  const app = mock([{ body: { ...pair, user: organizer } }, { body: organizer }])
  assert.deepEqual(await app.api.login(' org@example.com ', 'secret'), organizer)
  assert.equal(app.calls[1].url, '/api/auth/me')
  assert.equal(app.calls[1].headers.Authorization, 'Bearer old')
  assert.deepEqual(JSON.parse(app.stored()), pair)
})
test('attendee and event staff cannot access campaign portal; issued token revoked', async () => {
  for (const role of ['attendee', 'event_admin']) {
    const app = mock([{ body: pair }, { body: { roles: [role] } }, { status: 204 }])
    await assert.rejects(app.api.login('user@example.com', 'secret'), { status: 403 })
    assert.equal(app.stored(), null)
    assert.equal(app.calls[2].url, '/api/auth/logout')
  }
})
test('pagination stays on same-origin API despite absolute next URL', async () => {
  const app = mock([{ body: { results: [{ id: 1 }], next: 'https://untrusted.example/api/data' } }, { body: { results: [{ id: 2 }], next: null } }], JSON.stringify(pair))
  assert.deepEqual(await app.api.list('/me/events'), [{ id: 1 }, { id: 2 }])
  assert.deepEqual(app.calls.map(call => call.url), ['/api/me/events?page=1', '/api/me/events?page=2'])
})
test('refresh rotates token before retrying and expired refresh clears session', async () => {
  const app = mock([{ status: 401 }, { body: { access: 'new', refresh: 'new-refresh' } }, { body: { id: 1 } }], JSON.stringify(pair))
  await app.api.request('/events/1/campaigns', { name: 'Launch' })
  assert.equal(app.calls[1].url, '/api/auth/refresh')
  assert.equal(app.calls[2].headers.Authorization, 'Bearer new')
  assert.equal(JSON.parse(app.stored()).refresh, 'new-refresh')
  const expired = mock([{ status: 401 }, { status: 401 }], JSON.stringify(pair))
  await assert.rejects(expired.api.request('/me/events'), { status: 401 })
  assert.equal(expired.stored(), null)
})
test('network/5xx creation failure is never automatically retried', async () => {
  for (const failure of [new Error('offline'), { status: 503, body: {} }]) {
    const app = mock([failure], JSON.stringify(pair))
    await assert.rejects(app.api.request('/events/1/campaigns', { name: 'Launch' }))
    assert.equal(app.calls.length, 1)
  }
})
test('server field errors are visible and forbidden mutations are not retried', async () => {
  const app = mock([{ status: 400, body: { ticket_types: ['Wrong event.'] } }], JSON.stringify(pair))
  await assert.rejects(app.api.request('/events/1/campaigns', {}), /ticket_types: Wrong event/)
  assert.equal(app.calls.length, 1)
})
test('logout removes local credentials even offline', async () => {
  const app = mock([new Error('offline')], JSON.stringify(pair))
  await assert.rejects(app.api.logout())
  assert.equal(app.stored(), null)
  assert.equal(await app.api.restore(), null)
})
test('campaign QR is downloaded as an authenticated blob without parsing it as JSON', async () => {
  const app = mock([{ raw: '<svg data-kind="campaign-link"></svg>', headers: { 'Content-Type': 'image/svg+xml' } }], JSON.stringify(pair))
  const blob = await app.api.blob('/campaigns/17/qr')
  assert.equal(await blob.text(), '<svg data-kind="campaign-link"></svg>')
  assert.equal(app.calls[0].url, '/api/campaigns/17/qr')
  assert.equal(app.calls[0].headers.Authorization, 'Bearer old')
})
