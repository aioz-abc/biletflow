import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { formatMoney } from '../utils/money'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

// /account — the attendee's tickets and orders (first page of each).
function Account() {
  const [tickets, setTickets] = useState(null)
  const [orders, setOrders] = useState(null)
  const [events, setEvents] = useState({}) // event id -> title
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([api('/me/tickets'), api('/me/orders')])
      .then(([ticketPage, orderPage]) => {
        if (!active) return
        setTickets(ticketPage.results)
        setOrders(orderPage.results)
        const ids = new Set([...ticketPage.results, ...orderPage.results].map((x) => x.event))
        for (const eventId of ids) {
          api(`/events/${eventId}`)
            .then((ev) => active && setEvents((known) => ({ ...known, [eventId]: ev.title })))
            .catch(() => {})
        }
      })
      .catch((err) => active && setError(err.message))
    return () => { active = false }
  }, [])

  const title = (eventId) => events[eventId] ?? `Event #${eventId}`
  const pending = orders?.filter((o) => o.status === 'pending') ?? []

  if (error) return <p role="alert" className="mx-auto max-w-3xl px-6 py-20">{error}</p>
  if (tickets === null) return <p className="mx-auto max-w-3xl px-6 py-20">Loading…</p>

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">My tickets</h1>

      {pending.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">Unfinished orders</h2>
          <ul className="mt-2 space-y-1">
            {pending.map((o) => (
              <li key={o.id}>
                {title(o.event)} · reserved until {dateFmt.format(new Date(o.expires_at))} ·{' '}
                <Link to={`/checkout/${o.id}`} className="text-indigo-600 underline">Continue checkout</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tickets.length === 0 ? (
        <p className="mt-6 text-gray-600">
          You have no tickets yet. <Link to="/" className="text-indigo-600 underline">Find an event</Link>
        </p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-white">
          {tickets.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-4">
              <span>
                <strong>{title(t.event)}</strong>
                <span className="block text-sm text-gray-600">
                  Ticket #{t.id} · {t.status === 'checked_in' ? 'Checked in' : t.status === 'valid' ? 'Valid' : t.status}
                </span>
              </span>
              <Link to={`/tickets/${t.id}`} className="text-indigo-600 underline">Show QR</Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-xl font-semibold">Orders</h2>
      {orders.length === 0 ? <p className="mt-2 text-gray-600">No orders yet.</p> : (
        <ul className="mt-3 divide-y rounded-xl border bg-white text-sm">
          {orders.map((o) => (
            <li key={o.id} className="flex justify-between p-3">
              <span>#{o.id} · {title(o.event)} · {dateFmt.format(new Date(o.created_at))}</span>
              <span>{o.status} · {formatMoney(o.total_minor)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default Account
