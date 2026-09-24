import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiGet } from '../api/client'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short' })
const money = new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT' })

function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [ticketTypes, setTicketTypes] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([apiGet(`/events/${id}`), apiGet(`/events/${id}/ticket-types`)])
      .then(([ev, types]) => {
        setEvent(ev)
        setTicketTypes(types.results ?? types)
      })
      .catch((err) => setError(err.status === 404 ? 'Event not found.' : err.message))
  }, [id])

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
        <ul className="mt-3 divide-y rounded-xl border bg-white">
          {ticketTypes.map((t) => (
            <li key={t.id} className="flex justify-between p-4">
              <span>{t.name}</span>
              <span>
                {t.price_minor === 0 ? 'Free' : money.format(t.price_minor / 100)}
                <span className="ml-3 text-sm text-gray-500">{t.available} left</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default EventDetail
