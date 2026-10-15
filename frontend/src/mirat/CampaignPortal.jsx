import { useCallback, useEffect, useRef, useState } from 'react'
import { campaignPayload, createCampaignApi } from './campaignApi.js'
import './workspace.css'

const money = value => new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT' }).format(value / 100)
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
let storage
try { storage = window.sessionStorage } catch { storage = { getItem: () => null, setItem() {}, removeItem() {} } }
const api = createCampaignApi(storage)
let initialSession
function restore() {
  // React StrictMode must not rotate the same refresh token twice on mount.
  if (!initialSession) initialSession = api.restore().finally(() => { initialSession = null })
  return initialSession
}

function CampaignEditor({ event, onFailure }) {
  const [data, setData] = useState(null)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [discountType, setDiscountType] = useState('percent')
  const [created, setCreated] = useState(null)
  const [uncertain, setUncertain] = useState(false)
  const submitting = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([api.list(`/events/${event.id}/ticket-types`), api.list(`/events/${event.id}/campaigns`)])
      .then(([types, campaigns]) => { if (active) { setData({ types, campaigns }); setError('') } })
      .catch(failure => { if (active) { setError(failure.message); onFailure(failure) } })
      .finally(() => { if (active) setFetching(false) })
    return () => { active = false }
  }, [event.id, reload, onFailure])

  async function submit(e) {
    e.preventDefault()
    if (submitting.current || !data || uncertain || fetching) return
    const form = e.currentTarget
    const fields = new FormData(form)
    let payload
    try { payload = campaignPayload({ ...Object.fromEntries(fields), ticket_types: fields.getAll('ticket_types') }, data.types.map(type => type.id)) }
    catch (failure) { setError(failure.message); return }
    submitting.current = true
    setBusy(true)
    setError('')
    setCreated(null)
    try {
      const result = await api.request(`/events/${event.id}/campaigns`, payload)
      if (!Number.isInteger(result?.id)) throw new Error('Не удалось подтвердить создание кампании.')
      if (!alive.current) return
      setCreated(result)
      setData(previous => ({ ...previous, campaigns: [result, ...previous.campaigns] }))
      form.reset()
      setDiscountType('percent')
    } catch (failure) {
      if (!alive.current) return
      setError(failure.message)
      // A lost response may follow a successful save; never automatically repeat this POST.
      if (!failure.status || failure.status >= 500 || failure.status < 400) setUncertain(true)
      onFailure(failure)
    } finally {
      submitting.current = false
      if (alive.current) setBusy(false)
    }
  }
  function refreshList() { setFetching(true); setReload(value => value + 1) }
  return <>
    {error && <p className="mw-notice" role="alert">{error}</p>}
    {!data ? <section className="mw-panel">{error ? <button disabled={fetching} onClick={refreshList}>Повторить загрузку</button> : <p role="status">Загружаем билеты и кампании…</p>}</section> : <>
      {created && <section className="mw-panel mw-success" role="status"><h2>Кампания создана</h2><p>{created.name} · №{created.id}</p><p>Промокод: <strong>{created.codes?.map(code => code.code).join(', ') || 'Смотрите список кампаний'}</strong></p><p>Скидка: {created.discount_type === 'percent' ? `${created.discount_value}%` : money(created.discount_value)}</p></section>}
      {uncertain && <section className="mw-panel" role="alert"><h2>Проверьте результат перед повтором</h2><p>Ответ сервера не получен. Кампания могла сохраниться. Обновите список ниже и проверьте название, даты и скидку.</p><button disabled={fetching} onClick={refreshList}>Обновить список кампаний</button><button className="mw-secondary" onClick={() => setUncertain(false)}>Я проверил список — разрешить новую отправку</button></section>}
      <div className="mw-columns"><form className="mw-panel" onSubmit={submit} aria-busy={busy}>
        <h2>Новая кампания</h2><p>{event.title}</p>
        <fieldset disabled={busy || uncertain || fetching} className="mw-fields">
          <label>Название<input name="name" required maxLength={120} placeholder="Студенческая скидка" /></label>
          <label>Тип скидки<select name="discount_type" value={discountType} onChange={e => setDiscountType(e.target.value)}><option value="percent">Процент</option><option value="fixed">Сумма в тенге</option></select></label>
          <label>{discountType === 'percent' ? 'Скидка, %' : 'Скидка, ₸'}<input key={discountType} name="discount_value" type="number" required min={discountType === 'percent' ? '1' : '0.01'} max={discountType === 'percent' ? '100' : '10000000'} step={discountType === 'percent' ? '1' : '0.01'} /></label>
          <p>Часовой пояс дат: <strong>{zone}</strong> (время вашего браузера).</p>
          <label>Начало<input name="starts_at" type="datetime-local" required /></label>
          <label>Окончание<input name="ends_at" type="datetime-local" required /></label>
          <label>Максимум применений<input name="max_redemptions" type="number" min="1" max="2147483647" step="1" placeholder="Без ограничения" /></label>
          <fieldset className="mw-ticket-options"><legend>Применимые типы билетов</legend><p>Ничего не выбрано — все типы, включая добавленные позднее.</p>{data.types.length ? data.types.map(type => <label className="mw-checkbox" key={type.id}><input type="checkbox" name="ticket_types" value={type.id} />{type.name} · {money(type.price_minor)}{type.hidden ? ' · скрытый' : ''}</label>) : <p>У события пока нет типов билетов. Кампания будет применяться ко всем будущим типам.</p>}</fieldset>
          <button type="submit">{busy ? 'Создаём…' : 'Создать кампанию'}</button>
        </fieldset>
      </form><section className="mw-panel"><h2>Условия кампании</h2><p>После сохранения сервер выдаст промокод. Новая кампания включена; даты определяют период её действия.</p><p>Фиксированная скидка вводится в тенге. Окончательную скидку и ограничения проверяет сервер при оформлении заказа.</p><p>Смена события сбросит незаполненную форму.</p></section></div>
      <section className="mw-panel"><div className="mw-account"><h2>Сохранённые кампании</h2><button disabled={busy || fetching} onClick={refreshList}>Обновить список</button></div>{data.campaigns.length === 0 ? <p>У этого события пока нет кампаний.</p> : <div className="mw-table"><table><thead><tr><th>Название / ID</th><th>Промокод</th><th>Скидка</th><th>Период</th><th>Типы билетов</th><th>Лимит</th></tr></thead><tbody>{data.campaigns.map(campaign => <tr key={campaign.id}><td>{campaign.name} · #{campaign.id}<br />{campaign.enabled ? 'Включена' : 'Отключена'}</td><td>{campaign.codes.map(code => code.code).join(', ')}</td><td>{campaign.discount_type === 'percent' ? `${campaign.discount_value}%` : money(campaign.discount_value)}</td><td>{campaign.starts_at ? new Date(campaign.starts_at).toLocaleString('ru-KZ') : 'Без начала'} — {campaign.ends_at ? new Date(campaign.ends_at).toLocaleString('ru-KZ') : 'Без окончания'}</td><td>{campaign.ticket_types.length ? campaign.ticket_types.map(id => data.types.find(type => type.id === id)?.name || `#${id}`).join(', ') : 'Все'}</td><td>{campaign.max_redemptions ?? 'Без ограничения'}</td></tr>)}</tbody></table></div>}</section>
    </>}
  </>
}

export default function CampaignPortal() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [events, setEvents] = useState(null)
  const [eventId, setEventId] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    restore().then(value => { if (active) setUser(value) }).catch(failure => { if (active) setError(failure.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!user) return
    let active = true
    api.list('/me/events').then(result => { if (active) { setEvents(result); setError('') } }).catch(failure => {
      if (active) { setError(failure.message); if (failure.status === 401) setUser(null) }
    })
    return () => { active = false }
  }, [user, attempt])
  // Stable callback prevents child data effects from restarting on parent renders.
  const onFailure = useCallback(failure => { if (failure.status === 401) { setUser(null); setEvents(null); setError(failure.message) } }, [])
  async function login(e) {
    e.preventDefault()
    if (busy) return
    const form = e.currentTarget
    const fields = new FormData(form)
    setBusy(true); setError('')
    try { setUser(await api.login(fields.get('email'), fields.get('password'))) }
    catch (failure) { setError(failure.message) }
    finally { form.reset(); setBusy(false) }
  }
  async function logout() {
    setBusy(true); setUser(null); setEvents(null); setEventId(''); setError('')
    try { await api.logout() } catch { setError('Вы вышли на этом устройстве; сервер не подтвердил отзыв сессии.') }
    finally { setBusy(false) }
  }
  const selected = events?.find(event => String(event.id) === eventId)
  return <div className="mw"><aside><a href="/" className="mw-brand">biletflow<span>ОРГАНИЗАТОР</span></a><nav aria-label="Кампании"><a href="/organizer/campaigns/new" aria-current="page">Промокампании</a><a href="/">На главную</a></nav></aside><main><header><p className="mw-eyebrow">BILETFLOW · ОРГАНИЗАТОР</p><h1>Промокампании</h1></header>
    {error && <p className="mw-notice" role="alert">{error}</p>}
    {loading ? <p role="status">Проверяем сессию…</p> : !user ? <form className="mw-panel mw-login" onSubmit={login}><h2>Вход организатора</h2><label>Email<input name="email" type="email" autoComplete="username" required disabled={busy} /></label><label>Пароль<input name="password" type="password" autoComplete="current-password" required disabled={busy} /></label><button disabled={busy}>{busy ? 'Подождите…' : 'Войти'}</button><p>Доступно организаторам и администраторам платформы.</p></form> : <>
      <section className="mw-panel mw-account"><p>{user.email}</p><button disabled={busy} onClick={logout}>Выйти</button></section>
      {!events ? <section className="mw-panel">{error ? <button onClick={() => setAttempt(value => value + 1)}>Повторить загрузку событий</button> : <p role="status">Загружаем события…</p>}</section> : events.length === 0 ? <section className="mw-panel"><h2>Пока нет событий</h2><p>Сначала создайте событие через интерфейс организатора или API. После этого обновите список.</p><button onClick={() => setAttempt(value => value + 1)}>Обновить события</button></section> : <section className="mw-panel"><label>Событие<select value={eventId} onChange={e => setEventId(e.target.value)}><option value="">Выберите событие</option>{events.map(event => <option key={event.id} value={event.id}>{event.title} · #{event.id}{event.published ? '' : ' · черновик'}</option>)}</select></label></section>}
      {selected && <CampaignEditor key={selected.id} event={selected} onFailure={onFailure} />}
    </>}
  </main></div>
}
