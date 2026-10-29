import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

// Organizer's own events, drafts included (GET /me/events).
function MyEvents() {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    api('/me/events')
      .then((data) => active && setEvents(data.results))
      .catch((err) => active && setError(err.message))
    return () => { active = false }
  }, [])

  return (
    <main className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">My events</h1>
        <Link to="/organizer/events/new" className="rounded bg-black px-4 py-2 text-white">
          Create event
        </Link>
      </div>
      {error && <p role="alert" className="mt-6 text-red-600">{error}</p>}
      {events === null && !error && <p className="mt-6">Loading…</p>}
      {events?.length === 0 && <p className="mt-6 text-gray-600">You have no events yet.</p>}
      {events?.length > 0 && (
        <ul className="mt-6 divide-y rounded-xl border bg-white">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span>
                <strong>{ev.title}</strong>
                <span className={`ml-2 rounded px-2 py-0.5 text-xs ${ev.published ? 'bg-green-100' : 'bg-gray-200'}`}>
                  {ev.published ? 'Published' : 'Draft'}
                </span>
                <span className="block text-sm text-gray-600">
                  {dateFmt.format(new Date(ev.starts_at))} · {ev.venue}
                </span>
              </span>
              <span className="flex gap-4 text-sm">
                <Link to={`/organizer/events/${ev.id}`} className="text-indigo-600 underline">Sales</Link>
                <Link to={`/organizer/events/${ev.id}/edit`} className="text-indigo-600 underline">
                  Edit &amp; tickets
                </Link>
                {ev.published && (
                  <Link to={`/events/${ev.id}`} className="text-indigo-600 underline">Public page</Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default MyEvents
