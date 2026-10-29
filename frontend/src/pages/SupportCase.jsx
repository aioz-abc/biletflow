import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import { useAuth } from '../auth/auth'
import {
  ATTENDEE_CATEGORIES, PLATFORM_CATEGORIES, STATUSES, caseHeader, isSupportSide, mergeMessages, statusLabel,
} from '../utils/support'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const POLL_MS = 10000 // the API has no websockets; clients poll ?after=

// /support/:id — one case and its message thread (the link in support emails).
// The requester and the support side (event owner, Event Admin with
// can_manage_support, platform admin) both reply here; only the support side
// changes status and assignment.
function CaseThread({ id }) {
  const { user } = useAuth()
  const [supportCase, setSupportCase] = useState(null)
  const [messages, setMessages] = useState([])
  const [reply, setReply] = useState('')
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState(false)
  const lastId = useRef(0)
  const bottom = useRef(null)

  const addMessages = useCallback((incoming) => {
    if (incoming.length === 0) return
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id))
    setMessages((thread) => mergeMessages(thread, incoming))
  }, [])

  useEffect(() => {
    let active = true

    const load = () => api(`/support-cases/${id}`).then((data) => {
      if (!active) return
      setSupportCase(caseHeader(data))
      addMessages(data.messages)
    })

    load().catch((err) => active && setError(err.status === 404 ? 'Case not found.' : err.message))

    const timer = setInterval(() => {
      if (document.hidden || lastId.current === 0) return
      api(`/support-cases/${id}/messages?after=${lastId.current}`)
        .then((incoming) => {
          if (!active || incoming.length === 0) return
          addMessages(incoming)
          load().catch(() => {}) // a new reply may come with a status change
        })
        .catch(() => {}) // try again on the next tick
    }, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [id, addMessages])

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'nearest' })
  }, [messages.length])

  async function send(e) {
    e.preventDefault()
    if (busy || !reply.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      const message = await api(`/support-cases/${id}/messages`, { method: 'POST', body: { body: reply } })
      addMessages([message])
      setReply('')
      // The requester's reply moves "waiting for customer" back to "in progress".
      setSupportCase(caseHeader(await api(`/support-cases/${id}`)))
    } catch (err) {
      setActionError(fieldErrors(err).body ?? err.message)
    } finally {
      setBusy(false)
    }
  }

  async function change(body) {
    setBusy(true)
    setActionError(null)
    try {
      setSupportCase(caseHeader(await api(`/support-cases/${id}`, { method: 'PATCH', body })))
    } catch (err) {
      setActionError(fieldErrors(err).assigned_to ?? err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p role="alert" className="mx-auto max-w-3xl px-6 py-20">{error}</p>
  if (!supportCase) return <p className="mx-auto max-w-3xl px-6 py-20">Loading…</p>

  const staff = isSupportSide(supportCase, user)
  const categories = supportCase.kind === 'platform' ? PLATFORM_CATEGORIES : ATTENDEE_CATEGORIES
  const resolved = supportCase.status === 'resolved'
  const reopenLink = supportCase.ticket ? `?ticket=${supportCase.ticket}`
    : supportCase.order ? `?order=${supportCase.order}`
      : supportCase.event ? `?event=${supportCase.event}` : ''

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/support" className="text-sm text-gray-500">← Support</Link>
      <h1 className="mt-2 text-3xl font-bold">{supportCase.subject}</h1>
      <p className="mt-1 text-sm text-gray-600">
        #{supportCase.id} · {categories[supportCase.category] ?? supportCase.category}
        {supportCase.ticket && <> · <Link to={`/tickets/${supportCase.ticket}`} className="underline">Ticket #{supportCase.ticket}</Link></>}
        {!supportCase.ticket && supportCase.order && ` · Order #${supportCase.order}`}
        {supportCase.event && <> · <Link to={`/events/${supportCase.event}`} className="underline">Event</Link></>}
        {staff && ` · from ${supportCase.requester_email}`}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className={`rounded px-2 py-0.5 ${resolved ? 'bg-gray-200' : 'bg-amber-100'}`}>
          {statusLabel(supportCase.status, staff)}
        </span>
        <span className="text-gray-600">
          {supportCase.assigned_to_email ? `Assigned to ${supportCase.assigned_to_email}` : 'Not assigned yet'}
        </span>
        {staff && (
          <>
            <label>
              <span className="sr-only">Status</span>
              <select value={supportCase.status} disabled={busy} onChange={(e) => change({ status: e.target.value })}
                className="rounded border bg-white px-2 py-1">
                {Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {supportCase.assigned_to === user.id ? (
              <button type="button" disabled={busy} onClick={() => change({ assigned_to: null })}
                className="text-indigo-600 underline disabled:opacity-50">Unassign me</button>
            ) : (
              <button type="button" disabled={busy} onClick={() => change({ assigned_to: user.id })}
                className="text-indigo-600 underline disabled:opacity-50">Assign to me</button>
            )}
          </>
        )}
      </div>

      <ol className="mt-6 space-y-3" aria-live="polite">
        {messages.map((m) => {
          const mine = m.author === user.id
          return (
            <li key={m.id} className={`max-w-[85%] rounded-xl border p-3 ${mine ? 'ml-auto bg-indigo-50' : 'bg-white'}`}>
              <p className="text-xs text-gray-500">
                {mine ? 'You' : m.author === supportCase.requester ? m.author_email : `${m.author_email} · support`}
                {' · '}{dateFmt.format(new Date(m.created_at))}
              </p>
              {/* Plain text: never render message bodies as HTML */}
              <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
            </li>
          )
        })}
      </ol>
      <div ref={bottom} />

      {resolved ? (
        <p className="mt-6 rounded-xl border bg-gray-50 p-4 text-sm">
          This case is resolved and closed for replies.{' '}
          {!staff && <Link to={`/support/new${reopenLink}`} className="text-indigo-600 underline">Open a new case</Link>}
        </p>
      ) : (
        <form onSubmit={send} className="mt-6">
          <label className="block">
            <span className="sr-only">Reply</span>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={5000}
              placeholder="Write a reply…" className="w-full rounded border bg-white px-3 py-2" />
          </label>
          <button disabled={busy || !reply.trim()} className="mt-2 rounded bg-black px-5 py-2 text-white disabled:opacity-50">
            {busy ? 'Sending…' : 'Send'}
          </button>
        </form>
      )}
      {actionError && <p role="alert" className="mt-2 text-sm text-red-600">{actionError}</p>}
      <p className="mt-4 text-xs text-gray-500">New replies appear here automatically and are also sent by email.</p>
    </main>
  )
}

// Keyed by id, so moving to another case starts with an empty thread.
export default function SupportCase() {
  const { id } = useParams()
  return <CaseThread key={id} id={id} />
}
