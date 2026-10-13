import { createSession } from './session.js'

export { ApiError } from './session.js'

let storage
try {
  storage = window.sessionStorage
} catch {
  storage = { getItem: () => null, setItem() {}, removeItem() {} }
}

// Attendee and organizer session; the admin portal keeps its own one
// (mirat/adminAuth.js) built on the same createSession.
export const session = createSession({ storage, key: 'biletflow.session' })

export const api = session.api

export const apiGet = (path) => api(path)

// DRF field errors -> { field: "first message" } for inline form errors.
export function fieldErrors(err) {
  const out = {}
  for (const [key, value] of Object.entries(err?.body ?? {})) {
    out[key] = Array.isArray(value) ? value[0] : typeof value === 'string' ? value : 'Invalid'
  }
  return out
}
