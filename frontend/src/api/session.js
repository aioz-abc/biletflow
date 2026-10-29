// The one login / token-refresh implementation for the whole web app.
// Attendee and organizer pages use it through api/client.js, the platform
// admin portal through mirat/adminAuth.js. Rules follow
// docs/FRONTEND_INTEGRATION.md §4.
//
// Session policy:
// - access + refresh tokens are kept in per-tab storage (sessionStorage), so a
//   reload keeps the user signed in but closing the tab ends the session;
// - the user object and roles are never stored: after a reload they are
//   re-read from /auth/me, so a cached role is never trusted;
// - passwords are never stored.

export class ApiError extends Error {
  constructor(status, body, message) {
    super(message ?? describe(status, body))
    this.status = status // 0 = network failure or timeout
    this.body = body ?? {}
  }
}

function describe(status, body) {
  if (status === 0) return 'Could not reach the server. Try again.'
  if (typeof body?.detail === 'string') return body.detail
  if (body?.non_field_errors?.[0]) return body.non_field_errors[0]
  if (typeof body?.[0] === 'string') return body[0] // ValidationError("...") arrives as a bare list
  if (status === 429) return 'Too many attempts. Wait a moment and try again.'
  if (status >= 500) return 'The server is temporarily unavailable. Try again.'
  return `Request failed (${status}).`
}

const isPair = (value) => typeof value?.access === 'string' && typeof value?.refresh === 'string'

export function createSession({ storage, key, request = fetch, timeout = 15000 }) {
  let tokens = null // { access, refresh }
  let user = null
  let generation = 0 // bumped on login/logout: late answers for an old session are ignored
  let refreshing = null // one shared Promise, so parallel 401s refresh only once
  let restoring = null
  const listeners = new Set()

  const emit = () => listeners.forEach((fn) => fn(user))

  function save(pair) {
    tokens = { access: pair.access, refresh: pair.refresh }
    try { storage.setItem(key, JSON.stringify(tokens)) } catch { /* In-memory session still works. */ }
  }

  function clear() {
    tokens = null
    user = null
    generation += 1
    refreshing = null
    restoring = null
    try { storage.removeItem(key) } catch { /* Storage may be disabled. */ }
    emit()
  }

  try {
    const saved = JSON.parse(storage.getItem(key))
    if (isPair(saved)) tokens = { access: saved.access, refresh: saved.refresh }
  } catch { clear() }

  async function send(path, { method = 'GET', body, access } = {}) {
    const headers = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (access) headers.Authorization = `Bearer ${access}`
    try {
      return await request(`/api${path}`, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeout),
      })
    } catch {
      throw new ApiError(0)
    }
  }

  async function read(response, as) {
    if (response.status === 204) return null
    if (as === 'blob' && response.ok) return response.blob()
    try { return await response.json() } catch { return null }
  }

  // Resolves true when new tokens were saved, false when the refresh token was
  // rejected (the session is then cleared). Network errors, 429 and 5xx throw
  // and keep the session, so a temporary problem never signs the user out.
  function refresh() {
    if (!refreshing) {
      const started = generation
      const pending = send('/auth/refresh', { method: 'POST', body: { refresh: tokens.refresh } })
        .then(async (response) => {
          const data = await read(response)
          if (started !== generation) return false
          if (response.ok && isPair(data)) {
            save(data)
            return true
          }
          if (response.ok || response.status === 400 || response.status === 401) {
            clear()
            return false
          }
          throw new ApiError(response.status, data)
        })
        .finally(() => { if (refreshing === pending) refreshing = null })
      refreshing = pending
    }
    return refreshing
  }

  // auth: false for login/register/refresh/logout and anything that must not
  // trigger a refresh. as: 'blob' for images such as the ticket QR.
  async function api(path, { method = 'GET', body, auth = true, as } = {}) {
    const used = auth ? tokens : null
    let response = await send(path, { method, body, access: used?.access })
    if (response.status === 401 && used) {
      // Another request may have rotated the tokens while this one was in flight.
      const renewed = tokens !== null && tokens !== used ? true : tokens !== null && await refresh()
      if (renewed && tokens) response = await send(path, { method, body, access: tokens.access })
    }
    const data = await read(response, as)
    if (!response.ok) throw new ApiError(response.status, data)
    return data
  }

  async function login(email, password) {
    clear()
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email: email.trim(), password },
      auth: false,
    })
    if (!isPair(data)) throw new ApiError(0, null, 'Unexpected server response. Try again.')
    save(data)
    user = data.user ?? null
    emit()
    return user
  }

  // Re-reads the current user from the server (after a reload, or to confirm
  // roles). Resolves null when there is no session or it ended meanwhile.
  function restore() {
    if (!tokens) return Promise.resolve(null)
    if (!restoring) {
      const started = generation
      const pending = api('/auth/me')
        .then((me) => {
          if (started !== generation) return null
          user = me
          emit()
          return me
        }, (error) => {
          if (error.status === 401) {
            if (started === generation) clear()
            throw error
          }
          if (started !== generation) return null
          throw error
        })
        .finally(() => { if (restoring === pending) restoring = null })
      restoring = pending
    }
    return restoring
  }

  // Signs out locally first, so this always succeeds on this device; it
  // rejects only when the server could not be told to revoke the token.
  async function logout() {
    if (refreshing) await refreshing.catch(() => {}) // revoke the newest refresh token
    const current = tokens
    clear()
    if (current) {
      await api('/auth/logout', { method: 'POST', body: { refresh: current.refresh }, auth: false })
    }
  }

  return {
    api,
    login,
    logout,
    restore,
    hasSession: () => tokens !== null,
    getUser: () => user,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
