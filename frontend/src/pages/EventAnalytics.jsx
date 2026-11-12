import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { allPages } from '../api/pages.js'
import { analyticsQuery, chartRows, datePreset, reconciliation } from '../utils/analytics.js'
import { formatAmount, formatMoney } from '../utils/money.js'

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' })
const asOfFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function Stat({ label, value, detail }) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {detail && <p className="mt-1 text-xs text-gray-500">{detail}</p>}
    </section>
  )
}

function MoneyTable({ rows, kind }) {
  if (!rows.length) return <p className="mt-3 text-gray-600">No {kind} data for this period.</p>
  return (
    <div className="relative mt-3 overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50 text-gray-600">
          <tr>
            <th className="p-3 font-medium">{kind === 'campaign' ? 'Campaign' : 'Ticket type'}</th>
            <th className="p-3 text-right font-medium">Issued</th>
            {kind === 'campaign' && <th className="p-3 text-right font-medium">Redemptions</th>}
            <th className="p-3 text-right font-medium">Collected</th>
            <th className="p-3 text-right font-medium">Discount</th>
            <th className="p-3 text-right font-medium">Refunded</th>
            <th className="p-3 text-right font-medium">Net receipts</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="p-3">
                <strong>{row.name}</strong>
                {kind === 'ticket' && <span className="block text-xs text-gray-500">{formatMoney(row.price_minor)}</span>}
              </td>
              <td className="p-3 text-right">{row.issued_tickets}</td>
              {kind === 'campaign' && <td className="p-3 text-right">{row.redemptions}</td>}
              <td className="p-3 text-right">{formatAmount(row.collected_minor)}</td>
              <td className="p-3 text-right">{formatAmount(row.discount_minor)}</td>
              <td className="p-3 text-right">{formatAmount(row.refunded_minor)}</td>
              <td className="p-3 text-right">{formatAmount(row.net_receipts_minor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function EventAnalytics() {
  const [requestedEvent] = useState(() => new URLSearchParams(window.location.search).get('event'))
  const [events, setEvents] = useState(null)
  const [eventId, setEventId] = useState('')
  const [ticketTypes, setTicketTypes] = useState([])
  const [filters, setFilters] = useState({ from: '', to: '', ticketType: '' })
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [analytics, setAnalytics] = useState(null)
  const [error, setError] = useState('')
  const [filterError, setFilterError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    allPages('/me/events').then((items) => {
      if (!active) return
      setEvents(items)
      if (items.length) {
        setLoading(true)
        const requested = items.find((item) => String(item.id) === requestedEvent)
        setEventId(String(requested?.id ?? items[0].id))
      }
    }).catch((failure) => active && setError(failure.message))
    return () => { active = false }
  }, [requestedEvent])

  useEffect(() => {
    if (!eventId) return
    let active = true
    allPages(`/events/${eventId}/ticket-types`)
      .then((items) => active && setTicketTypes(items))
      .catch(() => {})
    return () => { active = false }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    let active = true
    api(`/events/${eventId}/analytics${query}`)
      .then((data) => active && setAnalytics(data))
      .catch((failure) => active && setError(failure.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [eventId, query, refresh])

  function apply(event) {
    event.preventDefault()
    try {
      setFilterError('')
      setError('')
      setLoading(true)
      setQuery(analyticsQuery(filters))
      setRefresh((value) => value + 1)
    } catch (failure) {
      setFilterError(failure.message)
    }
  }

  function preset(days) {
    const dates = datePreset(days)
    const next = { ...filters, ...dates }
    setFilters(next)
    setFilterError('')
    setError('')
    setLoading(true)
    setQuery(analyticsQuery(next))
    setRefresh((value) => value + 1)
  }

  function allTime() {
    const next = { ...filters, from: '', to: '' }
    setFilters(next)
    setFilterError('')
    setError('')
    setLoading(true)
    setQuery(analyticsQuery(next))
    setRefresh((value) => value + 1)
  }

  if (events === null && !error) return <p>Loading analytics…</p>
  if (events?.length === 0) return <p>You need an event before analytics can be displayed.</p>

  const current = events?.find((item) => String(item.id) === eventId)
  const rows = chartRows(analytics?.daily)
  const inventory = analytics?.inventory
  const totals = analytics?.totals

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-gray-600">Real sales, inventory, campaign and check-in data from the backend.</p>
        </div>
        {current && <Link to={`/organizer/events/${eventId}`} className="text-indigo-600 underline">Open event sales</Link>}
      </div>

      <form onSubmit={apply} className="mt-6 rounded-xl border bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">Event
            <select className="mt-1 block w-full rounded border p-2" value={eventId} onChange={(event) => { setTicketTypes([]); setAnalytics(null); setError(''); setLoading(true); setEventId(event.target.value); setFilters((value) => ({ ...value, ticketType: '' })); setQuery('') }}>
              {events?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">From (inclusive)
            <input className="mt-1 block w-full rounded border p-2" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </label>
          <label className="text-sm font-medium">To (exclusive)
            <input className="mt-1 block w-full rounded border p-2" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </label>
          <label className="text-sm font-medium">Ticket type
            <select className="mt-1 block w-full rounded border p-2" value={filters.ticketType} onChange={(event) => setFilters({ ...filters, ticketType: event.target.value })}>
              <option value="">All ticket types</option>
              {ticketTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="submit" className="rounded bg-black px-4 py-2 text-white">Apply filters</button>
          <button type="button" className="rounded border px-3 py-2" onClick={() => preset(7)}>Last 7 days</button>
          <button type="button" className="rounded border px-3 py-2" onClick={() => preset(30)}>Last 30 days</button>
          <button type="button" className="rounded border px-3 py-2" onClick={allTime}>All time</button>
        </div>
        {filterError && <p role="alert" className="mt-3 text-sm text-red-600">{filterError}</p>}
      </form>

      {error && <p role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-red-700">{error}</p>}
      {loading && <p className="mt-6" role="status">Loading report…</p>}

      {!loading && analytics && (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-semibold">{current?.title}</h2>
            <p className="text-xs text-gray-500">Inventory as of {asOfFormat.format(new Date(analytics.as_of))} · {analytics.timezone}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Event capacity" value={inventory.capacity} detail="Whole-event capacity" />
            <Stat label="Active tickets" value={inventory.active_tickets} detail={`${inventory.reserved_tickets} currently reserved`} />
            <Stat label="Remaining" value={inventory.remaining} detail="Current sellable inventory" />
            <Stat label="Check-in" value={`${inventory.check_in_percent}%`} detail={`${inventory.checked_in} of ${inventory.active_tickets} active tickets`} />
            <Stat label="Sales before discount" value={formatAmount(totals.sales_before_discount_minor)} />
            <Stat label="Discounts" value={formatAmount(totals.discount_minor)} />
            <Stat label="Collected" value={formatAmount(totals.collected_minor)} />
            <Stat label="Refunded" value={formatAmount(totals.refunded_minor)} />
            <Stat label="Net receipts" value={formatAmount(totals.net_receipts_minor)} detail="Collected − refunds, before fees" />
            <Stat label="Processing fees" value={formatAmount(totals.fees_minor)} />
            <Stat label="Issued tickets" value={totals.issued_tickets} detail="Historical confirmations in this period" />
            <Stat label="Estimated payout" value={formatAmount(totals.net_receipts_minor - totals.fees_minor)} detail="Net receipts − fees" />
          </div>
          {inventory.ticket_type && (
            <p className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
              <strong>{inventory.ticket_type.name}:</strong> {inventory.ticket_type.active_tickets} active, {inventory.ticket_type.type_remaining} of {inventory.ticket_type.quantity} remaining. Event capacity remains {inventory.capacity}.
            </p>
          )}
          {!reconciliation(analytics) && <p role="alert" className="mt-3 text-red-600">Daily values do not reconcile with the totals.</p>}
          <p className="mt-3 text-xs text-gray-500">All monetary values are simulated KZT amounts; no real payments are processed.</p>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Sales over time</h2>
            {rows.length === 0 ? <p className="mt-3 text-gray-600">No confirmed sales or refunds yet.</p> : (
              <div className="mt-3 overflow-x-auto rounded-xl border bg-white p-4">
                <div className="min-w-[640px] space-y-2">
                  {rows.map((day) => (
                    <div className="grid grid-cols-[80px_1fr_140px] items-center gap-3 text-sm" key={day.date}>
                      <time dateTime={day.date}>{dayFormat.format(new Date(`${day.date}T00:00:00Z`))}</time>
                      <div className="space-y-1" aria-label={`${formatAmount(day.collected_minor)} collected and ${formatAmount(day.refunded_minor)} refunded`}>
                        <div className="h-3 rounded bg-emerald-100"><div className="h-3 rounded bg-emerald-600" style={{ width: `${day.collected_percent}%` }} /></div>
                        <div className="h-2 rounded bg-rose-100"><div className="h-2 rounded bg-rose-500" style={{ width: `${day.refunded_percent}%` }} /></div>
                      </div>
                      <span className="text-right text-xs"><strong>{formatAmount(day.collected_minor)}</strong><br /><span className="text-rose-700">− {formatAmount(day.refunded_minor)}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">By ticket type</h2>
            <MoneyTable rows={analytics.ticket_types} kind="ticket" />
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Campaign performance</h2>
            <p className="mt-1 text-sm text-gray-600">{analytics.campaign_scope}</p>
            <MoneyTable rows={analytics.campaigns} kind="campaign" />
          </section>
        </>
      )}
    </main>
  )
}
