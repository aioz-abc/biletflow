import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { formatAmount } from '../utils/money'
import { ACTION_LABEL, ORDER_STATUS, actionPath, confirmText } from '../utils/orders'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

// Organizer's orders for one event with Refund / Cancel registration (SRS 4.9).
// onChanged lets the sales summary above reload after a refund.
function EventOrders({ eventId, onChanged }) {
  const [page, setPage] = useState(null)
  const [confirming, setConfirming] = useState(null) // order id awaiting the second click
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    api(`/events/${eventId}/orders`)
      .then((data) => active && setPage(data))
      .catch((err) => active && setError(err.message))
    return () => { active = false }
  }, [eventId, version])

  async function run(order) {
    setBusy(true)
    setError(null)
    try {
      await api(actionPath(order), { method: 'POST' })
      setNotice(order.action === 'refund' ? `Order #${order.id} refunded.` : `Order #${order.id} cancelled.`)
      setConfirming(null)
      setVersion((v) => v + 1)
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">Orders</h2>
      <p className="text-sm text-gray-600">
        Refund a paid order or cancel a free registration. Its tickets stop working at the door.
      </p>
      {notice && <p role="status" className="mt-3 text-green-700">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-red-600">{error}</p>}
      {page === null ? (
        !error && <p className="mt-3">Loading…</p>
      ) : page.results.length === 0 ? (
        <p className="mt-3 text-gray-600">No orders yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 font-medium">Order</th>
                <th className="p-3 font-medium">Buyer</th>
                <th className="p-3 text-right font-medium">Tickets</th>
                <th className="p-3 text-right font-medium">Paid</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {page.results.map((order) => (
                <tr key={order.id}>
                  <td className="whitespace-nowrap p-3">
                    #{order.id}
                    {order.confirmed_at && (
                      <span className="block text-xs text-gray-500">{dateFmt.format(new Date(order.confirmed_at))}</span>
                    )}
                  </td>
                  <td className="p-3 break-all">{order.purchaser_email}</td>
                  <td className="p-3 text-right">
                    {order.tickets}
                    {order.checked_in > 0 && <span className="block text-xs text-gray-500">{order.checked_in} checked in</span>}
                  </td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {formatAmount(order.total_minor)}
                    {order.discount_minor > 0 && (
                      <span className="block text-xs text-gray-500">−{formatAmount(order.discount_minor)} promo</span>
                    )}
                  </td>
                  <td className="p-3">{ORDER_STATUS[order.status] ?? order.status}</td>
                  <td className="p-3 text-right">
                    {!order.action ? (
                      order.status === 'confirmed' && <span className="text-xs text-gray-500">Checked in, final</span>
                    ) : confirming === order.id ? (
                      <span className="flex flex-col items-end gap-2">
                        <span className="text-xs">{confirmText(order)}</span>
                        <span className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(order)}
                            className="rounded-lg bg-red-600 px-3 py-1 text-white disabled:opacity-50"
                          >
                            {busy ? 'Working…' : `Yes, ${ACTION_LABEL[order.action].toLowerCase()}`}
                          </button>
                          <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border px-3 py-1">
                            Keep
                          </button>
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setConfirming(order.id); setNotice(null) }}
                        className="whitespace-nowrap rounded-lg border border-red-300 px-3 py-1 text-red-700"
                      >
                        {ACTION_LABEL[order.action]}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {page.count > page.results.length && (
            <p className="border-t p-3 text-xs text-gray-500">Showing the latest {page.results.length} of {page.count} orders.</p>
          )}
        </div>
      )}
    </section>
  )
}

export default EventOrders
