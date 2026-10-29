import { useEffect, useState } from 'react'

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = response.status === 204 ? null : await response.json()
  if (!response.ok) {
    const message = data?.detail || Object.values(data || {}).flat().join(' ') || 'Запрос не выполнен'
    throw new Error(message)
  }
  return data
}

const money = (minor) => new Intl.NumberFormat('ru-KZ', {
  style: 'currency', currency: 'KZT', maximumFractionDigits: 2,
}).format(minor / 100)

export default function EventPage({ eventId }) {
  const [event, setEvent] = useState(null)
  const [types, setTypes] = useState([])
  const [typeId, setTypeId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [promoCode, setPromoCode] = useState(new URLSearchParams(window.location.search).get('promo_code') || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)
  const [token, setToken] = useState('')
  const [order, setOrder] = useState(null)
  const [preview, setPreview] = useState(null)
  const [ticket, setTicket] = useState(null)
  const [qrUrl, setQrUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([api(`/events/${eventId}`), api(`/events/${eventId}/ticket-types`)])
      .then(([eventData, typeData]) => {
        if (!active) return
        setEvent(eventData)
        setTypes(typeData.results)
        setTypeId(String(typeData.results[0]?.id || ''))
      })
      .catch((failure) => active && setError(failure.message))
    return () => { active = false }
  }, [eventId])

  useEffect(() => () => { if (qrUrl) URL.revokeObjectURL(qrUrl) }, [qrUrl])

  async function run(action) {
    setBusy(true)
    setError('')
    try { await action() } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }

  function signIn() {
    run(async () => {
      if (register) await api('/auth/register', { method: 'POST', body: { email, password } })
      const result = await api('/auth/login', { method: 'POST', body: { email, password } })
      setToken(result.access)
    })
  }

  function reserve() {
    run(async () => {
      const reserved = await api('/orders', {
        method: 'POST', token,
        body: { event: Number(eventId), items: [{ ticket_type: Number(typeId), quantity: Number(quantity) }] },
      })
      setOrder(reserved)
      const quote = await api(`/orders/${reserved.id}/preview`, {
        method: 'POST', token, body: promoCode ? { promo_code: promoCode } : {},
      })
      setPreview(quote)
    })
  }

  function recalculate() {
    run(async () => setPreview(await api(`/orders/${order.id}/preview`, {
      method: 'POST', token, body: promoCode ? { promo_code: promoCode } : {},
    })))
  }

  function cancel() {
    run(async () => {
      await api(`/orders/${order.id}/cancel`, { method: 'POST', token })
      setOrder(null)
      setPreview(null)
    })
  }

  function checkout() {
    run(async () => {
      const paid = await api(`/orders/${order.id}/checkout`, {
        method: 'POST', token,
        body: { outcome: 'success', ...(promoCode ? { promo_code: promoCode } : {}) },
      })
      const issued = paid.tickets[0]
      setTicket(issued)
      const image = await fetch(`/api/tickets/${issued.id}/qr`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (image.ok) setQrUrl(URL.createObjectURL(await image.blob()))
    })
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-10 text-gray-900">
      <a className="text-sm text-blue-700" href="/">← Все события</a>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
      {!event && !error && <p>Загружаем событие…</p>}
      {event && <>
        {event.images?.[0] && <img className="w-full rounded-xl object-cover" src={event.images[0]} alt={event.title} />}
        <header>
          <h1 className="text-3xl font-bold">{event.title}</h1>
          <p className="mt-2">{event.venue} · {new Date(event.starts_at).toLocaleString('ru-KZ')}</p>
          {event.category && <p className="text-sm text-gray-500">{event.category}</p>}
          {event.description && <p className="mt-4 whitespace-pre-line">{event.description}</p>}
        </header>
        {!token && <form className="space-y-3 rounded-xl border p-5" onSubmit={(e) => { e.preventDefault(); signIn() }}>
          <h2 className="text-xl font-semibold">{register ? 'Регистрация' : 'Вход'} для покупки</h2>
          <input className="w-full rounded border p-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="w-full rounded border p-2" type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={busy}>{register ? 'Зарегистрироваться' : 'Войти'}</button>
          <button className="ml-3 text-blue-700" type="button" onClick={() => setRegister(!register)}>{register ? 'У меня есть аккаунт' : 'Создать аккаунт'}</button>
        </form>}
        {!ticket && <section className="space-y-4 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Билеты</h2>
          {types.length === 0 && <p>Билеты пока недоступны.</p>}
          {types.length > 0 && <>
            <label className="block">Тип билета
              <select className="mt-1 w-full rounded border p-2" value={typeId} disabled={!!order} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((type) => <option key={type.id} value={type.id}>{type.name} · {money(type.price_minor)} · осталось {type.available}</option>)}
              </select>
            </label>
            <label className="block">Количество
              <input className="mt-1 w-full rounded border p-2" type="number" min="1" max="100" value={quantity} disabled={!!order} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label className="block">Промокод
              <input className="mt-1 w-full rounded border p-2" value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setPreview(null) }} />
            </label>
            {!order && <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={!token || busy || !typeId} onClick={reserve}>Зарезервировать</button>}
            {order && <div className="space-y-3">
              <p>Бронь №{order.id} · до {new Date(order.expires_at).toLocaleString('ru-KZ')}</p>
              {!preview && <button className="rounded border px-4 py-2 disabled:opacity-50" disabled={busy} onClick={recalculate}>Применить код и пересчитать</button>}
              {preview && <div aria-live="polite">
                <p>Сумма: {money(preview.subtotal_minor)}</p>
                <p>Скидка: {money(preview.discount_minor)}</p>
                <p className="font-semibold">К оплате: {money(preview.total_minor)}</p>
                <button className="mt-3 rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={checkout}>Подтвердить тестовую оплату</button>
              </div>}
              <button className="ml-3 text-red-700 disabled:opacity-50" disabled={busy} onClick={cancel}>Отменить бронь</button>
            </div>}
          </>}
        </section>}
        {ticket && <section className="rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Билет №{ticket.id} оформлен</h2>
          {qrUrl && <img className="mt-4 h-56 w-56" src={qrUrl} alt="QR-код билета для входа" />}
        </section>}
      </>}
    </main>
  )
}
