import { api } from './client.js'

// DRF page-number pagination. Construct each path locally instead of following
// the absolute `next` URL, so requests still use the shared auth/refresh client.
export async function allPages(path) {
  const items = []
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?'
    const result = await api(`${path}${separator}page=${page}`)
    if (!Array.isArray(result?.results)) throw new Error('The server returned an invalid list.')
    items.push(...result.results)
    if (!result.next) return items
  }
}
