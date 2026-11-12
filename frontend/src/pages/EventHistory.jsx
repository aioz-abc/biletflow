import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { allPages } from '../api/pages.js'
import { actionLabel, eventStatus, statusLabel } from '../utils/eventHistory.js'

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const statuses = ['all', 'draft', 'upcoming', 'active', 'completed', 'cancelled', 'suspended']

const badge = {
  draft: 'bg-gray-200 text-gray-700',
  upcoming: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-amber-100 text-amber-800',
  suspended: 'bg-red-100 text-red-800',
}

export default function EventHistory() {
  const [events, setEvents] = useState(null)
  const [status, setStatus] = useState('all')
  const [eventId, setEventId] = useState('')
  const [entries, setEntries] = useState(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let active = true
    allPages('/me/events').then((items) => {
      if (!active) return
      setEvents(items)
      if (items.length) setEventId(String(items[0].id))
    }).catch((failure) => active && setError(failure.message))
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!eventId) return
    let active = true
    api(`/events/${eventId}/audit-log?page=1`).then((data) => {
      if (!active) return
      setEntries(data.results)
      setHasMore(Boolean(data.next))
    }).catch((failure) => active && setError(failure.message))
    return () => { active = false }
  }, [eventId])

  async function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    setError('')
    try {
      const data = await api(`/events/${eventId}/audit-log?page=${nextPage}`)
      setEntries((known) => [...known, ...data.results])
      setPage(nextPage)
      setHasMore(Boolean(data.next))
    } catch (failure) {
      setError(failure.message)
    } finally {
      setLoadingMore(false)
    }
  }

  const visible = events?.filter((item) => status === 'all' || eventStatus(item) === status) ?? []
  const current = events?.find((item) => String(item.id) === eventId)

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Event history</h1>
          <p className="mt-1 text-gray-600">Event lifecycle and the append-only activity timeline.</p>
        </div>
        <Link to="/organizer/events" className="text-indigo-600 underline">Manage events</Link>
      </div>

      <section className="mt-6 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm font-medium">Status
            <select className="mt-1 block rounded border p-2" value={status} onChange={(event) => setStatus(event.target.value)}>
              {statuses.map((value) => <option key={value} value={value}>{value === 'all' ? 'All events' : statusLabel(value)}</option>)}
            </select>
          </label>
          <p className="text-sm text-gray-500">{visible.length} event{visible.length === 1 ? '' : 's'}</p>
        </div>
        {events === null && !error && <p className="mt-4">Loading events…</p>}
        {visible.length === 0 && events !== null && <p className="mt-4 text-gray-600">No events have this status.</p>}
        {visible.length > 0 && (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-gray-600"><tr><th className="p-3 font-medium">Event</th><th className="p-3 font-medium">Schedule</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium"><span className="sr-only">Timeline</span></th></tr></thead>
              <tbody className="divide-y">
                {visible.map((item) => {
                  const value = eventStatus(item)
                  return <tr key={item.id} className={String(item.id) === eventId ? 'bg-indigo-50' : ''}>
                    <td className="p-3"><strong>{item.title}</strong><span className="block text-xs text-gray-500">{item.venue}</span></td>
                    <td className="whitespace-nowrap p-3">{dateTime.format(new Date(item.starts_at))}<span className="block text-xs text-gray-500">to {dateTime.format(new Date(item.ends_at))}</span></td>
                    <td className="p-3"><span className={`rounded px-2 py-1 text-xs font-medium ${badge[value]}`}>{statusLabel(value)}</span></td>
                    <td className="p-3 text-right"><button className="text-indigo-600 underline" onClick={() => { setEntries(null); setPage(1); setError(''); setEventId(String(item.id)) }}>View activity</button></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <p role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-4 text-red-700">{error}</p>}
      {current && (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-xl font-semibold">Activity · {current.title}</h2><p className="text-sm text-gray-600">Newest first. Existing rows are never edited.</p></div>
            <Link to={`/organizer/events/${current.id}`} className="text-indigo-600 underline">Open event</Link>
          </div>
          {entries === null && !error && <p className="mt-4">Loading activity…</p>}
          {entries?.length === 0 && <p className="mt-4 text-gray-600">No activity has been recorded for this event.</p>}
          {entries?.length > 0 && (
            <ol className="mt-4 space-y-3 border-l-2 border-gray-200 pl-5">
              {entries.map((entry) => (
                <li className="relative rounded-xl border bg-white p-4 before:absolute before:-left-[1.7rem] before:top-5 before:h-3 before:w-3 before:rounded-full before:bg-indigo-600" key={entry.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <strong>{actionLabel(entry.action)}</strong>
                    <time className="text-xs text-gray-500" dateTime={entry.created_at}>{dateTime.format(new Date(entry.created_at))}</time>
                  </div>
                  {entry.description && <p className="mt-1 text-sm text-gray-700">{entry.description}</p>}
                  <p className="mt-2 text-xs text-gray-500">{entry.actor ? `Actor #${entry.actor}` : 'System'} · {entry.entity_type} #{entry.entity_id}</p>
                </li>
              ))}
            </ol>
          )}
          {hasMore && <button className="mt-4 rounded border px-4 py-2" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load older activity'}</button>}
        </section>
      )}
    </main>
  )
}
