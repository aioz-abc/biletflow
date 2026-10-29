import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { formatAmount, formatMoney } from '../utils/money'
import { ticketsSold } from '../utils/sales'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

// /organizer/events/:id — sales summary of one event (GET /events/{id}/sales).
function EventSales() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [sales, setSales] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([api(`/events/${id}`), api(`/events/${id}/sales`)])
      .then(([ev, summary]) => {
        if (!active) return
        setEvent(ev)
        setSales(summary)
      })
      .catch((err) => active && setError(err.status === 404 ? 'Event not found.' : err.message))
    return () => { active = false }
  }, [id])

  if (error) return <p role="alert" className="text-red-600">{error}</p>
  if (!sales) return <p>Loading…</p>

  return (
    <main>
      <Link to="/organizer" className="text-sm text-gray-500">← Overview</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{event.title}</h1>
          <p className="text-gray-600">
            {dateFmt.format(new Date(event.starts_at))} · {event.venue} · {event.published ? 'Published' : 'Draft'}
          </p>
        </div>
        <span className="flex gap-4 text-sm">
          <Link to={`/organizer/events/${id}/edit`} className="text-indigo-600 underline">Edit &amp; tickets</Link>
          {event.published && <Link to={`/events/${id}`} className="text-indigo-600 underline">Public page</Link>}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tickets sold" value={`${ticketsSold(sales)} / ${event.capacity}`} />
        <Stat label="Paid orders" value={sales.paid_orders} />
        <Stat label="Free registrations" value={sales.free_registrations} />
        <Stat label="Refunded orders" value={sales.refunded_orders} />
        <Stat label="Gross sales" value={formatAmount(sales.gross_minor)} />
        <Stat label="Promo discounts" value={formatAmount(sales.discounts_minor)} />
        <Stat label="Refunds" value={formatAmount(sales.refunds_minor)} />
        <Stat label={`Processing fees (${sales.processing_fee_bps / 100}%)`} value={formatAmount(sales.fees_minor)} />
      </div>
      <p className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4">
        Estimated payout: <strong>{formatAmount(sales.estimated_payout_minor)}</strong>
        <span className="block text-xs text-gray-600">Simulated payments. Gross − refunds − fees; gross is after promo discounts.</span>
      </p>

      <h2 className="mt-8 text-xl font-semibold">By ticket type</h2>
      {sales.ticket_types.length === 0 ? (
        <p className="mt-2 text-gray-600">
          No ticket types yet. <Link to={`/organizer/events/${id}/edit`} className="text-indigo-600 underline">Add one</Link>
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 text-right font-medium">Price</th>
                <th className="p-3 text-right font-medium">Sold / quantity</th>
                <th className="p-3 text-right font-medium">Reserved</th>
                <th className="p-3 text-right font-medium">Available</th>
                <th className="p-3 text-right font-medium">Checked in</th>
                <th className="p-3 text-right font-medium">Refunded</th>
                <th className="p-3 text-right font-medium">Sales before discount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sales.ticket_types.map((type) => (
                <tr key={type.ticket_type}>
                  <td className="p-3">{type.name}</td>
                  <td className="p-3 text-right">{formatMoney(type.price_minor)}</td>
                  <td className="p-3 text-right">{type.sold} / {type.quantity}</td>
                  <td className="p-3 text-right">{type.reserved}</td>
                  <td className="p-3 text-right">{type.available}</td>
                  <td className="p-3 text-right">{type.checked_in}</td>
                  <td className="p-3 text-right">{type.refunded}</td>
                  <td className="p-3 text-right">{formatAmount(type.sales_before_discount_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

export default EventSales
