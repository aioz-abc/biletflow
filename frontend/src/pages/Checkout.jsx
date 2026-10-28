import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { formatMoney } from '../utils/money'

const preview = (orderId, code) =>
  api(`/orders/${orderId}/preview`, { method: 'POST', body: code ? { promo_code: code } : {} })

// Message for a rejected promo code. 409 also covers "redemption limit reached";
// callers re-read the order when a 409 might mean it expired instead.
const promoError = (err) => err.body?.promo_code?.[0] ?? (err.status === 409 ? err.message : null)

function Countdown({ until, onExpire }) {
  const [now, setNow] = useState(() => Date.now())
  const fired = useRef(false)
  const left = Math.max(0, new Date(until).getTime() - now)

  useEffect(() => {
    if (left === 0) {
      if (!fired.current) onExpire()
      fired.current = true
      return
    }
    const timer = setTimeout(() => setNow(Date.now()), 1000)
    return () => clearTimeout(timer)
  }, [left, onExpire])

  const minutes = Math.floor(left / 60000)
  const seconds = String(Math.floor((left % 60000) / 1000)).padStart(2, '0')
  return <span className="font-mono">{minutes}:{seconds}</span>
}

// /checkout/:orderId — server-side totals, promo code, simulated payment.
function Checkout() {
  const { orderId } = useParams()
  const [searchParams] = useSearchParams()
  const [order, setOrder] = useState(null)
  const [event, setEvent] = useState(null)
  const [names, setNames] = useState({}) // ticket type id -> name
  const [quote, setQuote] = useState(null) // { subtotal_minor, discount_minor, total_minor }
  const [code, setCode] = useState(searchParams.get('promo_code') ?? '')
  const [applied, setApplied] = useState('') // code included in the quote
  const [promoMessage, setPromoMessage] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const initial = searchParams.get('promo_code')?.trim() ?? ''
    api(`/orders/${orderId}`)
      .then(async (data) => {
        if (!active) return
        setOrder(data)
        // Event and ticket-type names are only for display; the event may be unpublished by now.
        api(`/events/${data.event}`).then((ev) => active && setEvent(ev)).catch(() => {})
        api(`/events/${data.event}/ticket-types`)
          .then((types) => active && setNames(Object.fromEntries(types.results.map((t) => [t.id, t.name]))))
          .catch(() => {})
        if (data.status !== 'pending') return
        try {
          const q = await preview(orderId, initial)
          if (active) { setQuote(q); setApplied(initial) }
        } catch (err) {
          if (!active) return
          if (!initial || !promoError(err)) throw err
          setPromoMessage(promoError(err))
          setQuote(await preview(orderId, ''))
        }
      })
      .catch((err) => active && setError(err.status === 404 ? 'Order not found.' : err.message))
    return () => { active = false }
  }, [orderId, searchParams])

  async function run(action) {
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Unknown order state (lost response, expiry): the server's answer is final.
  async function reload() {
    const fresh = await api(`/orders/${orderId}`)
    setOrder(fresh)
    return fresh
  }

  const applyCode = (e) => {
    e.preventDefault()
    const next = code.trim()
    run(async () => {
      setPromoMessage(null)
      try {
        setQuote(await preview(orderId, next))
        setApplied(next)
      } catch (err) {
        if (!promoError(err)) throw err
        setPromoMessage(promoError(err))
        if (err.status === 409) await reload()
      }
    })
  }

  const pay = (outcome) => run(async () => {
    let result
    try {
      result = await api(`/orders/${orderId}/checkout`, {
        method: 'POST',
        // The code is re-validated here: it may have expired or run out since the preview.
        body: { outcome, ...(applied && { promo_code: applied }) },
      })
    } catch (err) {
      if (err.status === 0 || err.status === 409) {
        // Lost response or conflict: the server's view of the order decides what happened.
        const fresh = await reload()
        if (fresh.status !== 'pending') return
      }
      if (applied && promoError(err)) {
        setPromoMessage(promoError(err))
        setApplied('')
        setQuote(await preview(orderId, ''))
        throw new Error('The promo code could not be applied, so nothing was charged. Review the total and pay again.', { cause: err })
      }
      throw err
    }
    setOrder(result)
    if (result.status !== 'confirmed') {
      setMessage('Payment declined (simulated). You can try again until the reservation expires.')
    }
  })

  const cancel = () => run(async () => {
    setOrder(await api(`/orders/${orderId}/cancel`, { method: 'POST' }))
  })

  if (error) return <p role="alert" className="mx-auto max-w-3xl px-6 py-20">{error}</p>
  if (!order) return <p className="mx-auto max-w-3xl px-6 py-20">Loading…</p>

  const eventLink = <Link to={`/events/${order.event}`} className="text-indigo-600 underline">Back to the event</Link>

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold">Checkout</h1>
      <p className="mt-2 text-gray-600">
        Order #{order.id}{event && <> · {event.title}</>}
      </p>

      <ul className="mt-6 divide-y rounded-xl border bg-white">
        {order.items.map((item) => (
          <li key={item.ticket_type} className="flex justify-between p-4">
            <span>{names[item.ticket_type] ?? `Ticket type #${item.ticket_type}`} × {item.quantity}</span>
            <span>{formatMoney(item.unit_price_minor * item.quantity)}</span>
          </li>
        ))}
      </ul>

      {order.status === 'pending' && (
        <>
          <p className="mt-4 text-sm text-gray-600">
            Tickets are reserved for{' '}
            <Countdown until={order.expires_at} onExpire={() => { reload().catch(() => {}) }} />
          </p>

          <form onSubmit={applyCode} className="mt-6 flex items-end gap-3">
            <label className="flex-1">
              <span className="text-sm">Promo code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={32} autoComplete="off"
                className="mt-1 w-full rounded border px-3 py-2 uppercase" />
            </label>
            <button disabled={busy} className="rounded border px-4 py-2 disabled:opacity-50">Apply</button>
          </form>
          {promoMessage && <p role="alert" className="mt-2 text-sm text-red-600">{promoMessage}</p>}
          {applied && !promoMessage && <p className="mt-2 text-sm text-green-700">Code {applied.toUpperCase()} applied.</p>}

          {quote && (
            <dl className="mt-6 space-y-1" aria-live="polite">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(quote.subtotal_minor)}</dd></div>
              <div className="flex justify-between"><dt>Discount</dt><dd>−{formatMoney(quote.discount_minor)}</dd></div>
              <div className="flex justify-between text-lg font-semibold">
                <dt>Total</dt><dd>{formatMoney(quote.total_minor)}</dd>
              </div>
            </dl>
          )}

          {message && <p role="alert" className="mt-4 text-sm text-red-600">{message}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" disabled={busy || !quote} onClick={() => pay('success')}
              className="rounded bg-black px-5 py-2 text-white disabled:opacity-50">
              {quote?.total_minor === 0 ? 'Get tickets' : 'Pay (test payment)'}
            </button>
            <button type="button" disabled={busy || !quote} onClick={() => pay('failure')}
              className="rounded border px-4 py-2 disabled:opacity-50">
              Simulate declined payment
            </button>
            <button type="button" disabled={busy} onClick={cancel}
              className="px-2 py-2 text-red-700 disabled:opacity-50">
              Cancel reservation
            </button>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            This is a simulated payment: no card details are collected and no money is charged.
          </p>
        </>
      )}

      {order.status === 'confirmed' && (
        <section className="mt-8" aria-live="polite">
          <h2 className="text-xl font-semibold text-green-700">Payment complete. Your tickets:</h2>
          <p className="mt-1 text-sm text-gray-600">Paid {formatMoney(order.total_minor)}</p>
          <ul className="mt-3 divide-y rounded-xl border bg-white">
            {order.tickets.map((ticket) => (
              <li key={ticket.id} className="flex justify-between p-4">
                <span>{names[ticket.ticket_type] ?? 'Ticket'} #{ticket.id}</span>
                <Link to={`/tickets/${ticket.id}`} className="text-indigo-600 underline">Show QR</Link>
              </li>
            ))}
          </ul>
          <Link to="/account" className="mt-4 inline-block text-indigo-600 underline">All my tickets</Link>
        </section>
      )}

      {order.status === 'expired' && (
        <p className="mt-8">The reservation has expired and the tickets were released. {eventLink}</p>
      )}
      {order.status === 'cancelled' && (
        <p className="mt-8">This order was cancelled. {eventLink}</p>
      )}
      {order.status === 'refunded' && <p className="mt-8">This order was refunded.</p>}
    </main>
  )
}

export default Checkout
