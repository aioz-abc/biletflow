import { useEffect, useRef, useState } from 'react'
import { createAdminAuth } from './adminAuth.js'
import './workspace.css'

let storage
try { storage = window.sessionStorage } catch { storage = { getItem: () => null, setItem() {}, removeItem() {} } }
const auth = createAdminAuth(storage)
const sections = { overview: 'Обзор платформы', users: 'Пользователи', events: 'События', orders: 'Заказы' }

export default function AdminPortal() {
  const revision = useRef(0)
  const operation = useRef(false)
  const [session, setSession] = useState({ loading: true, user: null })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState('overview')

  useEffect(() => {
    let active = true
    async function check() {
      if (operation.current) return
      const started = revision.current
      try {
        const user = await auth.restore()
        if (active && started === revision.current) {
          setSession({ loading: false, user })
          if (user) setError('')
          window.history.replaceState(null, '', user ? '/admin' : '/admin/login')
        }
      } catch (failure) {
        if (active && started === revision.current) {
          setSession({ loading: false, user: null })
          setError(failure.message)
          window.history.replaceState(null, '', '/admin/login')
        }
      }
    }
    check()
    const onFocus = () => {
      if (!operation.current && auth.hasSession()) {
        setSession({ loading: true, user: null })
        check()
      }
    }
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(check, 60000)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [])

  async function login(event) {
    event.preventDefault()
    if (busy) return
    revision.current += 1
    operation.current = true
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError('')
    try {
      const user = await auth.login(data.get('email'), data.get('password'))
      setSession({ loading: false, user })
      window.history.replaceState(null, '', '/admin')
    } catch (failure) { setError(failure.message) }
    finally { form.reset(); operation.current = false; setBusy(false) }
  }
  async function logout() {
    revision.current += 1
    operation.current = true
    setBusy(true)
    setSession({ loading: false, user: null })
    setError('')
    window.history.replaceState(null, '', '/admin/login')
    try { await auth.logout() }
    catch { setError('Вы вышли на этом устройстве. Сервер не подтвердил отзыв сессии.') }
    finally { operation.current = false; setBusy(false); setSection('overview') }
  }

  return <div className="mw"><aside><a className="mw-brand" href="/">biletflow<span>PLATFORM ADMIN / PHASE 02</span></a>
    {session.user && <nav aria-label="Управление платформой">{Object.entries(sections).map(([key, label]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)}>{label}</button>)}</nav>}
    <p>Мират · Admin & Analytics<br />Этап 2 / 15–28 сентября</p></aside>
    <main><header><p className="mw-eyebrow">BILETFLOW · УПРАВЛЕНИЕ</p><h1>{session.user ? sections[section] : 'Вход администратора'}</h1></header>
      {error && <p className="mw-notice" role="alert">{error}</p>}
      {session.loading ? <p role="status">Проверяем сессию…</p> : session.user ? <>
        <section className="mw-panel mw-account"><div><strong>{session.user.first_name || 'Администратор платформы'}</strong><p>{session.user.email}</p></div><button disabled={busy} onClick={logout}>Выйти</button></section>
        <section className="mw-panel"><p className="mw-eyebrow">{section === 'overview' ? 'ВЫ ВОШЛИ В СИСТЕМУ' : 'СКОРО'}</p><h2>{section === 'overview' ? 'Панель готова к работе' : sections[section]}</h2><p>{section === 'overview' ? 'Это базовая панель администратора. Выберите раздел в меню. Данные и инструменты управления появятся на следующих этапах.' : 'Этот раздел пока пуст. Поиск и действия управления будут подключены на следующих этапах.'}</p></section>
      </> : <form className="mw-panel mw-login" onSubmit={login} aria-busy={busy}><p className="mw-eyebrow">PLATFORM ADMIN</p><h2>Вход в управление</h2><p>Войдите с аккаунтом администратора платформы.</p>
        <label>Email<input name="email" type="email" autoComplete="username" required disabled={busy} /></label>
        <label>Пароль<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label>
        <button disabled={busy} type="submit">{busy ? 'Подождите…' : 'Войти'}</button><small>Доступ выдаёт администратор проекта. Аккаунты организаторов и сотрудников событий не дают доступа к этой панели.</small>
      </form>}
    </main></div>
}
