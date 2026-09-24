const KEY = 'biletflow.admin.session'

export class AuthError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

// Per-tab storage; never persist passwords or trust a cached role.
export function createAdminAuth(storage, request = fetch) {
  let tokens = null
  let restoring = null
  let generation = 0
  function clear() {
    tokens = null
    generation += 1
    restoring = null
    try { storage.removeItem(KEY) } catch { /* Storage may be disabled. */ }
  }
  function save(value) {
    tokens = { access: value.access, refresh: value.refresh }
    try { storage.setItem(KEY, JSON.stringify(tokens)) } catch { /* In-memory session still works. */ }
  }
  try {
    const value = JSON.parse(storage.getItem(KEY))
    if (typeof value?.access === 'string' && typeof value?.refresh === 'string') tokens = value
  } catch { clear() }

  async function api(path, { body, access } = {}) {
    let response
    try {
      response = await request(`/api/auth/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { ...(body && { 'Content-Type': 'application/json' }), ...(access && { Authorization: `Bearer ${access}` }) },
        ...(body && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      })
    } catch { throw new AuthError('Не удалось связаться с сервером. Попробуйте ещё раз.') }
    if (!response.ok) {
      const message = response.status === 429 ? 'Слишком много попыток. Подождите и повторите.'
        : response.status >= 500 ? 'Сервер временно недоступен. Попробуйте ещё раз.'
        : response.status === 401 ? 'Неверные данные входа или сессия истекла.'
        : 'Не удалось выполнить запрос. Проверьте данные и повторите.'
      throw new AuthError(message, response.status)
    }
    if (response.status === 204) return null
    try { return await response.json() } catch { throw new AuthError('Некорректный ответ сервера. Попробуйте ещё раз.') }
  }
  async function logout() {
    const refresh = tokens?.refresh
    clear()
    if (refresh) await api('logout', { body: { refresh } })
  }
  async function requireAdmin(user) {
    if (!Array.isArray(user?.roles) || !user.roles.includes('platform_admin')) {
      try { await logout() } catch { /* Local credentials are already removed. */ }
      throw new AuthError('Доступ разрешён только администратору платформы.', 403)
    }
    return user
  }
  async function currentUser() {
    if (!tokens) return null
    const started = generation
    const session = tokens
    try {
      let user
      try { user = await api('me', { access: session.access }) }
      catch (error) {
        if (error.status !== 401) throw error
        const renewed = await api('refresh', { body: { refresh: session.refresh } })
        if (typeof renewed?.access !== 'string' || typeof renewed?.refresh !== 'string') {
          throw new AuthError('Сессия недействительна. Войдите снова.', 401)
        }
        if (started !== generation) return null
        save(renewed)
        user = await api('me', { access: tokens.access })
      }
      if (started !== generation) return null
      return await requireAdmin(user)
    } catch (error) {
      if (started !== generation && error.status !== 403) return null
      if (error.status === 401 || error.status === 403) clear()
      throw error
    }
  }
  return {
    async login(email, password) {
      clear()
      const result = await api('login', { body: { email: email.trim(), password } })
      if (typeof result?.access !== 'string' || typeof result?.refresh !== 'string') {
        throw new AuthError('Некорректный ответ сервера. Попробуйте ещё раз.')
      }
      save(result)
      // Confirm privileges with the server instead of trusting login or storage metadata.
      return this.restore()
    },
    restore() {
      if (!restoring) {
        const pending = currentUser().finally(() => { if (restoring === pending) restoring = null })
        restoring = pending
      }
      return restoring
    },
    logout,
    hasSession: () => Boolean(tokens),
  }
}
