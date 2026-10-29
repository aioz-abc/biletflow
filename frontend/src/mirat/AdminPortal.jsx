import { useCallback, useEffect, useRef, useState } from 'react'
import { createAdminAuth } from './adminAuth.js'
import './workspace.css'

let storage
try { storage = window.sessionStorage } catch { storage = { getItem: () => null, setItem() {}, removeItem() {} } }
const auth = createAdminAuth(storage)
const sections = { overview: 'Обзор платформы', users: 'Пользователи', events: 'События', activation: 'Активация продаж' }

async function listAll(path) {
  const items = []
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?'
    const result = await auth.api(`${path}${separator}page=${page}`)
    if (!Array.isArray(result?.results)) throw new Error('Сервер вернул некорректный список.')
    items.push(...result.results)
    if (!result.next) return items
  }
}

function Overview({ select }) {
  return <>
    <section className="mw-panel"><p className="mw-eyebrow">PHASE 04 · MODERATION</p><h2>Управление платформой</h2><p>Проверьте запросы на активацию платных продаж, пользователей и события. Действия приостановки выполняются сервером и сохраняются в журнале события.</p></section>
    <div className="mw-stats"><button className="mw-panel mw-dashboard-link" onClick={() => select('activation')}><strong>Активация</strong><small>Запросы организаторов</small></button><button className="mw-panel mw-dashboard-link" onClick={() => select('users')}><strong>Пользователи</strong><small>Поиск и приостановка</small></button><button className="mw-panel mw-dashboard-link" onClick={() => select('events')}><strong>События</strong><small>Модерация и причины</small></button></div>
  </>
}

function UsersPanel() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const load = useCallback(async (search = '') => {
    setError(''); setUsers(null)
    try { setUsers(await listAll(`/admin/users?search=${encodeURIComponent(search.trim())}`)) } catch (failure) { setError(failure.message) }
  }, [])
  useEffect(() => {
    let active = true
    listAll('/admin/users?search=').then(value => { if (active) setUsers(value) }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])
  async function toggle(user) {
    setBusy(user.id); setError('')
    try {
      const updated = await auth.api(`/admin/users/${user.id}/suspend`, { method: 'POST', body: { suspended: user.is_active } })
      setUsers(current => current.map(item => item.id === updated.id ? updated : item))
    } catch (failure) { setError(failure.message) } finally { setBusy(null) }
  }
  return <section className="mw-panel"><h2>Пользователи</h2><p>Приостановленный пользователь теряет текущие сессии и не может войти.</p><form className="mw-controls" onSubmit={event => { event.preventDefault(); load(query) }}><label>Поиск по email<input value={query} onChange={event => setQuery(event.target.value)} placeholder="user@example.com" /></label><button type="submit">Найти</button></form>{error && <p className="mw-notice" role="alert">{error}</p>}{!users ? <p role="status">Загружаем пользователей…</p> : users.length === 0 ? <p>Пользователи не найдены.</p> : <div className="mw-table"><table><thead><tr><th>Email</th><th>Роли</th><th>Статус</th><th>Действие</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.email}</td><td>{user.roles.join(', ') || 'attendee'}</td><td><span className={`mw-badge ${user.is_active ? 'is-active' : 'is-suspended'}`}>{user.is_active ? 'Активен' : 'Приостановлен'}</span></td><td>{user.roles.includes('platform_admin') ? <small>Администратор защищён</small> : <button className={user.is_active ? 'mw-danger' : ''} disabled={busy === user.id} onClick={() => toggle(user)}>{busy === user.id ? 'Сохраняем…' : user.is_active ? 'Приостановить' : 'Восстановить'}</button>}</td></tr>)}</tbody></table></div>}</section>
}

function EventsPanel() {
  const [events, setEvents] = useState(null)
  const [query, setQuery] = useState('')
  const [reasons, setReasons] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => { setError(''); try { setEvents(await listAll('/me/events')) } catch (failure) { setError(failure.message) } }, [])
  useEffect(() => {
    let active = true
    listAll('/me/events').then(value => { if (active) setEvents(value) }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])
  async function toggle(event) {
    const suspending = !event.suspended_at
    const reason = (reasons[event.id] || '').trim()
    if (suspending && !reason) { setError('Укажите причину приостановки события.'); return }
    setBusy(event.id); setError('')
    try {
      const updated = await auth.api(`/admin/events/${event.id}/suspend`, { method: 'POST', body: { suspended: suspending, reason } })
      setEvents(current => current.map(item => item.id === updated.id ? updated : item))
      setReasons(current => ({ ...current, [event.id]: '' }))
    } catch (failure) { setError(failure.message) } finally { setBusy(null) }
  }
  const visible = events?.filter(event => `${event.title} ${event.venue} ${event.id}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="mw-panel"><div className="mw-account"><div><h2>Модерация событий</h2><p>Приостановка закрывает новые продажи и публичные Campaign QR. Уже выданные билеты остаются действительными.</p></div><button disabled={!events} onClick={load}>Обновить</button></div><label>Поиск события<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Название, место или ID" /></label>{error && <p className="mw-notice" role="alert">{error}</p>}{!events ? <p role="status">Загружаем события…</p> : visible.length === 0 ? <p>События не найдены.</p> : <div className="mw-admin-cards">{visible.map(event => <article className="mw-admin-card" key={event.id}><div><h3>{event.title} · #{event.id}</h3><p>{event.venue}</p><span className={`mw-badge ${event.suspended_at ? 'is-suspended' : 'is-active'}`}>{event.suspended_at ? 'Приостановлено' : event.published ? 'Опубликовано' : 'Черновик'}</span>{event.suspension_reason && <p><strong>Причина:</strong> {event.suspension_reason}</p>}</div><div>{!event.suspended_at && <label>Причина<input value={reasons[event.id] || ''} maxLength={300} onChange={change => setReasons(current => ({ ...current, [event.id]: change.target.value }))} placeholder="Обязательна для приостановки" /></label>}<button className={!event.suspended_at ? 'mw-danger' : ''} disabled={busy === event.id} onClick={() => toggle(event)}>{busy === event.id ? 'Сохраняем…' : event.suspended_at ? 'Восстановить событие' : 'Приостановить событие'}</button></div></article>)}</div>}</section>
}

function ActivationPanel() {
  const [cases, setCases] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => { setError(''); try { setCases(await listAll('/support-cases?kind=platform&category=activation')) } catch (failure) { setError(failure.message) } }, [])
  useEffect(() => {
    let active = true
    listAll('/support-cases?kind=platform&category=activation').then(value => { if (active) setCases(value) }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])
  async function setStatus(item, status) {
    setBusy(item.id); setError('')
    try {
      const updated = await auth.api(`/support-cases/${item.id}`, { method: 'PATCH', body: { status } })
      setCases(current => current.map(value => value.id === updated.id ? updated : value))
    } catch (failure) { setError(failure.message) } finally { setBusy(null) }
  }
  return <section className="mw-panel"><div className="mw-account"><div><h2>Запросы на активацию платных продаж</h2><p>Запросы организаторов из поддержки с категорией «activation».</p></div><button disabled={!cases} onClick={load}>Обновить</button></div>{error && <p className="mw-notice" role="alert">{error}</p>}{!cases ? <p role="status">Загружаем запросы…</p> : cases.length === 0 ? <p>Запросов на активацию пока нет.</p> : <div className="mw-table"><table><thead><tr><th>Запрос</th><th>Организатор</th><th>Событие</th><th>Статус</th><th>Рассмотрение</th></tr></thead><tbody>{cases.map(item => <tr key={item.id}><td>#{item.id} · {item.subject}<br /><small>{new Date(item.created_at).toLocaleString('ru-KZ')}</small></td><td>{item.requester_email}</td><td>{item.event ? `#${item.event}` : 'Не указано'}</td><td><span className="mw-badge">{item.status}</span></td><td><div className="mw-actions"><button disabled={busy === item.id || item.status === 'in_progress'} onClick={() => setStatus(item, 'in_progress')}>В работу</button><button disabled={busy === item.id || item.status === 'resolved'} onClick={() => setStatus(item, 'resolved')}>Закрыть</button></div></td></tr>)}</tbody></table></div>}</section>
}

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
      try { const user = await auth.restore(); if (active && started === revision.current) { setSession({ loading: false, user }); if (user) setError(''); window.history.replaceState(null, '', user ? '/admin' : '/admin/login') } }
      catch (failure) { if (active && started === revision.current) { setSession({ loading: false, user: null }); setError(failure.message); window.history.replaceState(null, '', '/admin/login') } }
    }
    check()
    const onFocus = () => { if (!operation.current && auth.hasSession()) { setSession({ loading: true, user: null }); check() } }
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(check, 60000)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [])
  async function login(event) {
    event.preventDefault(); if (busy) return
    revision.current += 1; operation.current = true
    const form = event.currentTarget; const data = new FormData(form)
    setBusy(true); setError('')
    try { const user = await auth.login(data.get('email'), data.get('password')); setSession({ loading: false, user }); window.history.replaceState(null, '', '/admin') } catch (failure) { setError(failure.message) } finally { form.reset(); operation.current = false; setBusy(false) }
  }
  async function logout() {
    revision.current += 1; operation.current = true; setBusy(true); setSession({ loading: false, user: null }); setError(''); window.history.replaceState(null, '', '/admin/login')
    try { await auth.logout() } catch { setError('Вы вышли на этом устройстве. Сервер не подтвердил отзыв сессии.') } finally { operation.current = false; setBusy(false); setSection('overview') }
  }
  return <div className="mw"><aside><a className="mw-brand" href="/">biletflow<span>PLATFORM ADMIN</span></a>{session.user && <nav aria-label="Управление платформой">{Object.entries(sections).map(([key, label]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)}>{label}</button>)}</nav>}</aside><main><header><p className="mw-eyebrow">BILETFLOW · УПРАВЛЕНИЕ</p><h1>{session.user ? sections[section] : 'Вход администратора'}</h1></header>{error && <p className="mw-notice" role="alert">{error}</p>}{session.loading ? <p role="status">Проверяем сессию…</p> : session.user ? <><section className="mw-panel mw-account"><div><strong>{session.user.first_name || 'Администратор платформы'}</strong><p>{session.user.email}</p></div><button disabled={busy} onClick={logout}>Выйти</button></section>{section === 'overview' ? <Overview select={setSection} /> : section === 'users' ? <UsersPanel /> : section === 'events' ? <EventsPanel /> : <ActivationPanel />}</> : <form className="mw-panel mw-login" onSubmit={login} aria-busy={busy}><p className="mw-eyebrow">PLATFORM ADMIN</p><h2>Вход в управление</h2><p>Войдите с аккаунтом администратора платформы.</p><label>Email<input name="email" type="email" autoComplete="username" required disabled={busy} /></label><label>Пароль<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label><button disabled={busy} type="submit">{busy ? 'Подождите…' : 'Войти'}</button><small>Доступ выдаёт администратор проекта. Аккаунты организаторов и сотрудников событий не дают доступа к этой панели.</small></form>}</main></div>
}
