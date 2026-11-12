import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import { useAuth } from '../auth/auth'
import { PERMISSIONS, normalizeEmail, permissionLabels, validateStaffForm } from '../utils/staff'

const EMPTY = { email: '', can_check_in: true, can_manage_support: false }

// /organizer/events/:id/staff — Event Admins for one event
// (GET/POST /events/{id}/staff, DELETE /events/{id}/staff/{user_id}).
// They sign in to the mobile scanner and/or handle this event's support cases.
function EventStaff() {
  const { id } = useParams()
  const { user } = useAuth()
  const [event, setEvent] = useState(null)
  const [staff, setStaff] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([api(`/events/${id}`), api(`/events/${id}/staff`)])
      .then(([ev, page]) => {
        if (!active) return
        setEvent(ev)
        setStaff(page.results)
      })
      .catch((err) => active && setError(err.status === 404 ? 'Event not found.' : err.message))
    return () => { active = false }
  }, [id])

  async function add(e) {
    e.preventDefault()
    if (busy) return
    const problems = validateStaffForm(form, staff, user.email)
    setErrors(problems)
    setNotice(null)
    if (Object.keys(problems).length > 0) return
    setBusy(true)
    try {
      const created = await api(`/events/${id}/staff`, {
        method: 'POST',
        body: { ...form, email: normalizeEmail(form.email) },
      })
      setStaff((list) => [...list, created])
      setForm(EMPTY)
      setNotice(`${created.user_email} is now an Event Admin.`)
    } catch (err) {
      const errs = fieldErrors(err)
      setErrors({
        email: errs.email
          ?? (err.status === 404 ? 'No active BiletFlow account uses this email. Ask them to register first.' : undefined)
          ?? (err.status === 409 ? 'This person is already an Event Admin here.' : undefined),
        form: Object.keys(errs).length === 0 && err.status !== 404 && err.status !== 409 ? err.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  async function remove(assignment) {
    if (busy) return
    if (!window.confirm(`Remove ${assignment.user_email} as Event Admin? They lose check-in and support access.`)) return
    setBusy(true)
    setNotice(null)
    setErrors({})
    try {
      await api(`/events/${id}/staff/${assignment.user}`, { method: 'DELETE' })
      setStaff((list) => list.filter((a) => a.id !== assignment.id))
      setNotice(`${assignment.user_email} was removed.`)
    } catch (err) {
      if (err.status === 404) setStaff((list) => list.filter((a) => a.id !== assignment.id))
      else setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p role="alert" className="text-red-600">{error}</p>
  if (!staff) return <p>Loading…</p>

  return (
    <main className="max-w-3xl">
      <Link to={`/organizer/events/${id}`} className="text-sm text-gray-500">← {event.title}</Link>
      <h1 className="mt-2 text-3xl font-bold">Event Admins</h1>
      <p className="mt-2 text-gray-600">
        Event Admins help with this event only. With check-in they can sign in to the BiletFlow
        scanner app; with support they can answer and assign this event&apos;s support cases.
      </p>

      {staff.length === 0 ? (
        <p className="mt-6 text-gray-600">No Event Admins yet.</p>
      ) : (
        <ul className="mt-6 divide-y rounded-xl border bg-white">
          {staff.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span className="min-w-0">
                <strong className="break-all">{a.user_email}</strong>
                <span className="block text-sm text-gray-600">{permissionLabels(a).join(' · ') || 'No permissions'}</span>
              </span>
              <button type="button" onClick={() => remove(a)} disabled={busy}
                className="text-sm text-red-700 underline disabled:opacity-50">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} noValidate className="mt-8 space-y-4 rounded-xl border bg-white p-6">
        <h2 className="text-xl font-semibold">Add an Event Admin</h2>
        <label className="block">
          <span className="text-sm">Email of their BiletFlow account</span>
          <input type="email" value={form.email} autoComplete="off" maxLength={254}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-invalid={Boolean(errors.email)} className="mt-1 w-full rounded border px-3 py-2" />
          {errors.email && <span className="mt-1 block text-sm text-red-600">{errors.email}</span>}
        </label>
        <fieldset>
          <legend className="text-sm">Permissions</legend>
          {Object.entries(PERMISSIONS).map(([key, label]) => (
            <label key={key} className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
          {errors.permissions && <span className="mt-1 block text-sm text-red-600">{errors.permissions}</span>}
        </fieldset>
        <p className="text-xs text-gray-500">To change permissions, remove the person and add them again.</p>
        {errors.form && <p role="alert" className="text-sm text-red-600">{errors.form}</p>}
        <button disabled={busy} className="rounded bg-black px-5 py-2 text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Add Event Admin'}
        </button>
      </form>
      {notice && <p role="status" className="mt-4 text-sm text-green-700">{notice}</p>}
    </main>
  )
}

export default EventStaff
