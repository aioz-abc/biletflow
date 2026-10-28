const SESSION_KEY = 'biletflow.campaign.session'

export class CampaignError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

function errorText(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(errorText).join(' ')
  if (value && typeof value === 'object') return Object.entries(value).map(([key, message]) => `${key}: ${errorText(message)}`).join(' ')
  return ''
}

export function createCampaignApi(storage, transport = fetch) {
  let tokens = null
  let renewal = null
  let version = 0
  function clear() {
    tokens = null
    version += 1
    try { storage.removeItem(SESSION_KEY) } catch { /* Memory-only when storage is unavailable. */ }
  }
  function save(value) {
    if (typeof value?.access !== 'string' || typeof value?.refresh !== 'string') throw new CampaignError('Некорректная сессия. Войдите снова.', 401)
    tokens = { access: value.access, refresh: value.refresh }
    try { storage.setItem(SESSION_KEY, JSON.stringify(tokens)) } catch { /* Memory-only fallback. */ }
  }
  try {
    const saved = storage.getItem(SESSION_KEY)
    if (saved) save(JSON.parse(saved))
  } catch { clear() }

  async function send(path, body, access) {
    let response
    try {
      response = await transport(`/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(access && { Authorization: `Bearer ${access}` }) },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      })
    } catch { throw new CampaignError('Нет связи с сервером. Проверьте подключение.') }
    if (response.status === 204) return null
    let data
    try { data = await response.json() } catch { throw new CampaignError('Сервер вернул неожиданный ответ.', response.status) }
    if (!response.ok) throw new CampaignError(
      response.status === 401 ? 'Сессия истекла или данные входа неверны. Войдите снова.'
        : response.status === 429 ? 'Слишком много запросов. Подождите и повторите.'
        : response.status >= 500 ? 'Сервер временно недоступен.'
        : errorText(data) || 'Запрос не выполнен.', response.status)
    return data
  }
  async function refresh() {
    if (!renewal) {
      const started = version
      const refreshToken = tokens?.refresh
      const pending = send('/auth/refresh', { refresh: refreshToken }).then(value => {
        if (version !== started) throw new CampaignError('Войдите снова.', 401)
        save(value)
      }).catch(error => {
        if (version === started && error.status === 401) clear()
        throw error
      }).finally(() => { if (renewal === pending) renewal = null })
      renewal = pending
    }
    return renewal
  }
  async function request(path, body) {
    if (!tokens) throw new CampaignError('Войдите в аккаунт организатора.', 401)
    const started = version
    const access = tokens.access
    try { return await send(path, body, access) } catch (error) {
      if (error.status !== 401 || started !== version) throw error
      if (tokens?.access === access) await refresh()
      if (!tokens || started !== version) throw new CampaignError('Войдите снова.', 401)
      try { return await send(path, body, tokens.access) } catch (failure) {
        if (failure.status === 401 && started === version) clear()
        throw failure
      }
    }
  }
  async function logout() {
    const refreshToken = tokens?.refresh
    clear()
    if (refreshToken) await send('/auth/logout', { refresh: refreshToken })
  }
  async function me() {
    const user = await request('/auth/me')
    if (!user.roles?.some(role => ['organizer', 'platform_admin'].includes(role))) {
      try { await logout() } catch { /* Credentials are already removed locally. */ }
      throw new CampaignError('Нужен аккаунт организатора или администратора платформы.', 403)
    }
    return user
  }
  return {
    request, logout,
    async restore() { return tokens ? me() : null },
    async login(email, password) {
      clear()
      save(await send('/auth/login', { email: email.trim(), password }))
      return me()
    },
    async list(path) {
      const items = []
      for (let page = 1; ; page += 1) {
        // Do not send JWTs to an absolute URL supplied by a paginated response.
        const result = await request(`${path}?page=${page}`)
        if (!Array.isArray(result.results)) throw new CampaignError('Некорректный список от сервера.')
        items.push(...result.results)
        if (!result.next) return items
      }
    },
  }
}

export function campaignPayload(form, allowedTypeIds) {
  const name = form.name.trim()
  if (!name || name.length > 120) throw new Error('Название: от 1 до 120 символов.')
  const type = form.discount_type
  if (!['percent', 'fixed'].includes(type)) throw new Error('Выберите тип скидки.')
  const raw = String(form.discount_value).trim().replace(',', '.')
  if (!(type === 'percent' ? /^\d+$/ : /^\d+(\.\d{1,2})?$/).test(raw)) throw new Error('Введите корректную скидку; сумма в тенге — до двух знаков после запятой.')
  const [whole, fraction = ''] = raw.split('.')
  const value = type === 'fixed' ? Number(whole) * 100 + Number(fraction.padEnd(2, '0')) : Number(whole)
  if (!Number.isSafeInteger(value) || value < 1 || value > (type === 'percent' ? 100 : 1000000000)) throw new Error('Скидка: 1–100% или 0,01–10 000 000 ₸.')
  const starts = new Date(form.starts_at)
  const ends = new Date(form.ends_at)
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) throw new Error('Укажите даты: окончание должно быть позже начала.')
  const limit = String(form.max_redemptions).trim()
  if (limit && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 2147483647)) throw new Error('Лимит должен быть целым числом от 1 до 2147483647.')
  const ids = [...new Set(form.ticket_types.map(Number))]
  if (ids.some(id => !allowedTypeIds.includes(id))) throw new Error('Тип билета не принадлежит выбранному событию.')
  return { name, discount_type: type, discount_value: value, starts_at: starts.toISOString(), ends_at: ends.toISOString(), max_redemptions: limit ? Number(limit) : null, ticket_types: ids, enabled: true }
}
