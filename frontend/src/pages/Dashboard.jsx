import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { formatAmount } from '../utils/money'
import { dashboardTotals, ticketsSold } from '../utils/sales'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

// /organizer — every event with its sales at a glance (GET /me/events, then
// GET /events/{id}/sales per event on the first page).
function Dashboard() {
  const [events, setEvents] = useState(null)
  const [sales, setSales] = useState({}) // event id -> sales summary
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    api('/me/events')
      .then((page) => {
        if (!active) return
        setEvents(page.results)
        for (const ev of page.results) {
          api(`/events/${ev.id}/sales`)
            .then((summary) => active && setSales((known) => ({ ...known, [ev.id]: summary })))
            .catch(() => {}) // that row shows "—"
        }
      })
      .catch((err) => active && setError(err.message))
    return () => { active = false }
  }, [])

  if (error) return <p role="alert" className="text-red-600">{error}</p>
  if (events === null) return <p>Loading…</p>

  const totals = dashboardTotals(events, sales)

  return (
    <main>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Overview</h1>
        <Link to="/organizer/events/new" className="rounded bg-black px-4 py-2 text-white">Create event</Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Events (published)" value={`${totals.events} (${totals.published})`} />
        <Stat label="Tickets sold" value={totals.sold} />
        <Stat label="Gross sales" value={formatAmount(totals.gross)} />
        <Stat label="Estimated payout" value={formatAmount(totals.payout)} />
      </div>
      <p className="mt-2 text-xs text-gray-500">Payments are simulated. Payout = gross − refunds − processing fees.</p>

      {events.length === 0 ? (
        <p className="mt-8 text-gray-600">
          You have no events yet. <Link to="/organizer/events/new" className="text-indigo-600 underline">Create one</Link>
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 font-medium">Event</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 text-right font-medium">Sold / capacity</th>
                <th className="p-3 text-right font-medium">Gross</th>
                <th className="p-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((ev) => {
                const summary = sales[ev.id]
                return (
                  <tr key={ev.id}>
                    <td className="p-3">
                      <strong>{ev.title}</strong>
                      <span className={`ml-2 rounded px-2 py-0.5 text-xs ${ev.published ? 'bg-green-100' : 'bg-gray-200'}`}>
                        {ev.published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-3">{dateFmt.format(new Date(ev.starts_at))}</td>
                    <td className="p-3 text-right">{summary ? `${ticketsSold(summary)} / ${ev.capacity}` : '—'}</td>
                    <td className="p-3 text-right">{summary ? formatAmount(summary.gross_minor) : '—'}</td>
                    <td className="whitespace-nowrap p-3 text-right">
                      <Link to={`/organizer/events/${ev.id}`} className="text-indigo-600 underline">Sales</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

export default Dashboard
