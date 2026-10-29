import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short' })
const STATUS = { valid: 'Valid', checked_in: 'Checked in', cancelled: 'Cancelled', refunded: 'Refunded' }

// /tickets/:id — the QR to show at the entrance, plus a download.
function Ticket() {
  const { id } = useParams()
  const [ticket, setTicket] = useState(null)
  const [event, setEvent] = useState(undefined) // null = no longer public
  const [typeName, setTypeName] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    let objectUrl = null
    api(`/tickets/${id}`)
      .then((data) => {
        if (!active) return
        setTicket(data)
        api(`/events/${data.event}`).then((ev) => active && setEvent(ev)).catch(() => active && setEvent(null))
        api(`/events/${data.event}/ticket-types`)
          .then((types) => active && setTypeName(types.results.find((t) => t.id === data.ticket_type)?.name ?? null))
          .catch(() => {})
      })
      .catch((err) => active && setError(err.status === 404 ? 'Ticket not found.' : err.message))
    // The QR endpoint needs the Bearer header, which a plain <img src> cannot send.
    api(`/tickets/${id}/qr`, { as: 'blob' })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (active) setQrUrl(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => {})
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])

  if (error) return <p role="alert" className="mx-auto max-w-3xl px-6 py-20">{error}</p>
  if (!ticket) return <p className="mx-auto max-w-3xl px-6 py-20">Loading…</p>

  return (
    <main className="mx-auto max-w-md px-6 py-12 text-center">
      <Link to="/account" className="text-sm text-gray-500">← My tickets</Link>
      <article className="mt-4 rounded-2xl border bg-white p-6 shadow-sm">
        {event ? (
          <>
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <p className="mt-1 text-gray-600">{dateFmt.format(new Date(event.starts_at))}</p>
            <p className="text-gray-600">{event.venue}</p>
          </>
        ) : (
          <h1 className="text-2xl font-bold">
            {event === null ? 'Event details are no longer public' : 'Ticket'}
          </h1>
        )}
        <p className="mt-3">
          {typeName ?? 'Ticket'} · #{ticket.id} ·{' '}
          <span className={ticket.status === 'valid' ? 'text-green-700' : 'text-gray-600'}>
            {STATUS[ticket.status] ?? ticket.status}
          </span>
        </p>
        {qrUrl ? (
          <img src={qrUrl} alt={`QR code for ticket ${ticket.id}`} className="mx-auto mt-4 h-64 w-64" />
        ) : (
          <p className="mt-4 text-gray-600">Loading QR code…</p>
        )}
        <p className="mt-2 break-all font-mono text-xs text-gray-500">{ticket.identifier}</p>
        {ticket.checked_in_at && (
          <p className="mt-2 text-sm">Checked in {dateFmt.format(new Date(ticket.checked_in_at))}</p>
        )}
      </article>
      {qrUrl && (
        <a href={qrUrl} download={`biletflow-ticket-${ticket.id}.svg`}
          className="mt-6 inline-block rounded bg-black px-5 py-2 text-white">
          Download QR
        </a>
      )}
      <p className="mt-6 text-sm">
        <Link to={`/support/new?ticket=${ticket.id}`} className="text-indigo-600 underline">
          Problem with this ticket? Contact the organizer
        </Link>
      </p>
    </main>
  )
}

export default Ticket
