import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import { useAuth } from '../auth/auth'
import { formatMoney } from '../utils/money'
import { ATTENDEE_CATEGORIES, PLATFORM_CATEGORIES, caseContext } from '../utils/support'

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })
const PLATFORM = 'platform' // "about" value for an organizer's case to the platform

// /support/new?ticket=5 (or ?order= / ?event=) — open a support case
// (POST /support-cases). Without a link in the URL the user picks one of
// their orders; organizers may also write to the platform team.
function NewSupportCase() {
  const { isOrganizer } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const linked = caseContext(params)
  const hasLink = Object.keys(linked).length > 0
  const [orders, setOrders] = useState(null)
  const [about, setAbout] = useState('') // order id, or PLATFORM
  const [form, setForm] = useState({ category: '', subject: '', message: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const sending = useRef(false) // a double click must not open two cases

  useEffect(() => {
    if (hasLink) return
    let active = true
    api('/me/orders')
      .then((page) => active && setOrders(page.results.filter((o) => o.status !== 'pending')))
      .catch(() => active && setOrders([]))
    return () => { active = false }
  }, [hasLink])

  const platform = !hasLink && about === PLATFORM
  const categories = platform ? PLATFORM_CATEGORIES : ATTENDEE_CATEGORIES
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    if (sending.current) return
    if (!hasLink && !about) {
      setErrors({ about: 'Choose what this case is about.' })
      return
    }
    sending.current = true
    setSubmitting(true)
    setErrors({})
    const context = hasLink ? linked : platform ? {} : { order: Number(about) }
    try {
      const created = await api('/support-cases', { method: 'POST', body: { ...form, ...context } })
      navigate(`/support/${created.id}`, { replace: true })
    } catch (err) {
      const errs = fieldErrors(err)
      setErrors({
        ...errs,
        // Bad or foreign event/order/ticket links come back as 400 on that field, or 404.
        form: errs.event || errs.order || errs.ticket || errs.non_field_errors
          || (err.status === 404 ? 'That ticket or order was not found in your account.' : undefined)
          || (Object.keys(errs).length === 0 ? err.message : undefined),
      })
    } finally {
      sending.current = false
      setSubmitting(false)
    }
  }

  const contextLabel = linked.ticket ? `Ticket #${linked.ticket}` : linked.order ? `Order #${linked.order}` : `Event #${linked.event}`

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link to="/support" className="text-sm text-gray-500">← Support</Link>
      <h1 className="mt-2 text-3xl font-bold">New support case</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border bg-white p-6" noValidate>
        {hasLink ? (
          <p>About: <strong>{contextLabel}</strong></p>
        ) : orders === null ? (
          <p>Loading your orders…</p>
        ) : (
          <label className="block">
            <span className="text-sm">What is this about?</span>
            <select value={about} onChange={(e) => { setAbout(e.target.value); setForm({ ...form, category: '' }) }}
              aria-invalid={Boolean(errors.about)} className="mt-1 w-full rounded border bg-white px-3 py-2">
              <option value="">Choose…</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  Order #{o.id} · {dateFmt.format(new Date(o.created_at))} · {formatMoney(o.total_minor)}
                </option>
              ))}
              {isOrganizer && <option value={PLATFORM}>My organizer account (platform support)</option>}
            </select>
            {errors.about && <span className="mt-1 block text-sm text-red-600">{errors.about}</span>}
            {orders.length === 0 && !isOrganizer && (
              <span className="mt-1 block text-sm text-gray-600">
                Cases are opened about an order or ticket, and you have none yet.
              </span>
            )}
          </label>
        )}

        <label className="block">
          <span className="text-sm">Category</span>
          <select name="category" value={form.category} onChange={update} required
            aria-invalid={Boolean(errors.category)} className="mt-1 w-full rounded border bg-white px-3 py-2">
            <option value="">Choose…</option>
            {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {errors.category && <span className="mt-1 block text-sm text-red-600">{errors.category}</span>}
        </label>
        <label className="block">
          <span className="text-sm">Subject</span>
          <input name="subject" value={form.subject} onChange={update} maxLength={200} required
            aria-invalid={Boolean(errors.subject)} className="mt-1 w-full rounded border px-3 py-2" />
          {errors.subject && <span className="mt-1 block text-sm text-red-600">{errors.subject}</span>}
        </label>
        <label className="block">
          <span className="text-sm">Message</span>
          <textarea name="message" value={form.message} onChange={update} maxLength={5000} rows={5} required
            aria-invalid={Boolean(errors.message)} className="mt-1 w-full rounded border px-3 py-2" />
          {errors.message && <span className="mt-1 block text-sm text-red-600">{errors.message}</span>}
        </label>
        {errors.form && <p role="alert" className="text-sm text-red-600">{errors.form}</p>}
        <button disabled={submitting} className="rounded bg-black px-5 py-2 text-white disabled:opacity-50">
          {submitting ? 'Sending…' : 'Open case'}
        </button>
      </form>
    </main>
  )
}

export default NewSupportCase
