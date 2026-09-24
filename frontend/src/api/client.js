const BASE = '/api'

// Tokens live in memory only (see docs/FRONTEND_INTEGRATION.md §4):
// a page reload logs the user out, which is fine for Phase 2.
let session = null // { access, refresh, user }
let refreshing = null // one shared Promise so parallel 401s refresh only once
const listeners = new Set()

export function getSession() {
  return session
}

export function setSession(next) {
  session = next
  listeners.forEach((fn) => fn(session))
}

export function onSessionChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.detail || body?.non_field_errors?.[0] || `Request failed: ${status}`)
    this.status = status
    this.body = body ?? {}
  }
}

async function send(method, path, body, access) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (access) headers.Authorization = `Bearer ${access}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  return { res, data }
}

function refreshTokens() {
  if (!refreshing) {
    const current = session
    refreshing = send('POST', '/auth/refresh', { refresh: current.refresh })
      .then(({ res, data }) => {
        if (session !== current) return session !== null // user logged out/in meanwhile
        setSession(res.ok ? { ...current, access: data.access, refresh: data.refresh } : null)
        return res.ok
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const withAuth = auth && session !== null
  let { res, data } = await send(method, path, body, withAuth ? session.access : null)
  if (res.status === 401 && withAuth && (await refreshTokens())) {
    ;({ res, data } = await send(method, path, body, session.access))
  }
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

export const apiGet = (path) => api(path)

// DRF field errors -> { field: "first message" } for inline form errors.
export function fieldErrors(err) {
  const out = {}
  for (const [key, value] of Object.entries(err?.body ?? {})) {
    out[key] = Array.isArray(value) ? value[0] : typeof value === 'string' ? value : 'Invalid'
  }
  return out
}
