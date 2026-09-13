const BASE = '/api'

export async function apiGet(path) {
    const res = await fetch(BASE + path)
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed: ${res.status}`)
    }
    return res.json()
}