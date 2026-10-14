import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../auth/auth'
import { formatMoney } from '../utils/money'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short' })
const shortFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const MAX_TICKETS = 100 // per order, enforced by the API too

// Why a ticket type cannot be bought right now, or null if it can.
function closedReason(type, now) {
  if (type.sales_start && new Date(type.sales_start) > now) {
    return `On sale from ${shortFmt.format(new Date(type.sales_start))}`
  }
  if (type.sales_end && new Date(type.sales_end) <= now) return 'Sales have ended'
  if (type.available === 0) return 'Sold out'
  return null
}

function EventDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [event, setEvent] = useState(null)
  const [ticketTypes, setTicketTypes] = useState([])
  const [error, setError] = useState(null)
  const [quantities, setQuantities] = useState({}) // ticket type id -> quantity
  // A Campaign QR link lands here as /events/:id?promo_code=CODE
  const [promoCode, setPromoCode] = useState(searchParams.get('promo_code') ?? '')
  const [orderError, setOrderError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [now] = useState(() => new Date())

  useEffect(() => {
    let active = true
    Promise.all([api(`/events/${id}`), api(`/events/${id}/ticket-types`)])
      .then(([ev, types]) => {
        if (!active) return
        setEvent(ev)
        setTicketTypes(types.results)
      })
      .catch((err) => active && setError(err.status === 404 ? 'Event not found.' : err.message))
    return () => { active = false }
  }, [id])

  const selected = ticketTypes.filter((t) => quantities[t.id] > 0)
  const count = selected.reduce((sum, t) => sum + quantities[t.id], 0)
  const estimate = selected.reduce((sum, t) => sum + t.price_minor * quantities[t.id], 0)

  function setQuantity(type, value) {
    const others = count - (quantities[type.id] ?? 0)
    const limit = Math.min(type.max_per_order, type.available, MAX_TICKETS - others)
    setQuantities({ ...quantities, [type.id]: Math.max(0, Math.min(limit, value)) })
    setOrderError(null)
  }

  async function reserve() {
    if (!user) {
      // Come back to this page (and promo code) after logging in.
      navigate('/login', { state: { from: location.pathname + location.search } })
      return
    }
    setBusy(true)
    setOrderError(null)
    try {
      // Exactly one POST /orders per click: it has no idempotency key.
      const order = await api('/orders', {
        method: 'POST',
        body: {
          event: event.id,
          items: selected.map((t) => ({ ticket_type: t.id, quantity: quantities[t.id] })),
        },
      })
      const code = promoCode.trim()
      navigate(`/checkout/${order.id}${code ? `?promo_code=${encodeURIComponent(code)}` : ''}`)
    } catch (err) {
      setOrderError(err.status === 0
        ? 'Could not reach the server. Check My tickets before trying again, the order may have been created.'
        : err.message)
      if (err.status === 409) {
        // Availability changed: show fresh numbers.
        api(`/events/${id}/ticket-types`).then((types) => setTicketTypes(types.results)).catch(() => {})
      }
      setBusy(false)
    }
  }

  if (error) return <p role="alert" className="mx-auto max-w-3xl px-6 py-20">{error}</p>
  if (!event) return <p className="mx-auto max-w-3xl px-6 py-20">Loading…</p>

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/" className="text-sm text-gray-500">← All events</Link>
      {event.images?.[0] && (
        <img src={event.images[0]} alt="" className="mt-4 aspect-video w-full rounded-xl object-cover" />
      )}
      {event.category && (
        <span className="mt-4 block w-fit rounded-full bg-gray-100 px-3 py-1 text-xs">{event.category}</span>
      )}
      <h1 className="mt-3 text-4xl font-bold">{event.title}</h1>
      <p className="mt-3 text-gray-600">
        {dateFmt.format(new Date(event.starts_at))} · {event.venue}
      </p>
      {event.description && <p className="mt-6 whitespace-pre-line">{event.description}</p>}

      <h2 className="mt-10 text-xl font-semibold">Tickets</h2>
      {ticketTypes.length === 0 ? (
        <p className="mt-2 text-gray-600">Tickets are not on sale yet.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y rounded-xl border bg-white">
            {ticketTypes.map((t) => {
              const reason = closedReason(t, now)
              const quantity = quantities[t.id] ?? 0
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <span>
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-sm text-gray-600">
                      {formatMoney(t.price_minor)}
                      {reason ? ` · ${reason}` : ` · ${t.available} left · up to ${t.max_per_order} per order`}
                    </span>
                  </span>
                  {!reason && (
                    <span className="flex items-center gap-2">
                      <button type="button" aria-label={`Fewer ${t.name} tickets`} disabled={quantity === 0 || busy}
                        onClick={() => setQuantity(t, quantity - 1)}
                        className="h-9 w-9 rounded border text-lg disabled:opacity-40">−</button>
                      <span className="w-8 text-center" aria-live="polite" aria-label={`${t.name} quantity`}>
                        {quantity}
                      </span>
                      <button type="button" aria-label={`More ${t.name} tickets`} disabled={busy}
                        onClick={() => setQuantity(t, quantity + 1)}
                        className="h-9 w-9 rounded border text-lg disabled:opacity-40">+</button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-4 space-y-3 rounded-xl border bg-white p-4">
            <label className="block">
              <span className="text-sm">Promo code</span>
              <input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} maxLength={32}
                className="mt-1 w-full rounded border px-3 py-2 uppercase" autoComplete="off" />
              <span className="mt-1 block text-xs text-gray-500">The discount is checked and applied at checkout.</span>
            </label>
            <p>
              {count === 0 ? 'Select tickets to continue.' : (
                <>{count} ticket{count === 1 ? '' : 's'} · <strong>{formatMoney(estimate)}</strong> before discount</>
              )}
            </p>
            {orderError && <p role="alert" className="text-sm text-red-600">{orderError}</p>}
            <button type="button" onClick={reserve} disabled={count === 0 || busy}
              className="rounded bg-black px-5 py-2 text-white disabled:opacity-50">
              {busy ? 'Reserving…' : user ? 'Continue to checkout' : 'Log in to buy'}
            </button>
          </div>
        </>
      )}
    </main>
  )
}

export default EventDetail
