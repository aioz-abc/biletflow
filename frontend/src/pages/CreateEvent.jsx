import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'

const CATEGORIES = ['music', 'education', 'sports', 'tech', 'arts', 'business', 'other']

const empty = {
  title: '', date: '', time: '', duration: '2', venue: '', category: '',
  capacity: '100', description: '',
}

// date + time are the browser's local zone; the API needs ISO with an offset.
function toRange({ date, time, duration }) {
  if (!date || !time) return {}
  const start = new Date(`${date}T${time}`)
  const end = new Date(start.getTime() + Number(duration) * 60 * 60 * 1000)
  return { starts_at: start.toISOString(), ends_at: end.toISOString() }
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function Input({ label, error, className = '', ...props }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm">{label}</span>
      <input {...props} aria-invalid={Boolean(error)}
        className="mt-1 w-full rounded bg-gray-50 px-3 py-2 focus:outline-2 focus:outline-indigo-500" />
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}

function CreateEvent() {
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})
  const [event, setEvent] = useState(null) // saved draft from the API
  const [busy, setBusy] = useState(false)

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const range = toRange(form)

  async function saveDraft(e) {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    const body = {
      title: form.title,
      description: form.description,
      venue: form.venue,
      category: form.category,
      capacity: Number(form.capacity),
      ...range,
    }
    try {
      setEvent(
        event
          ? await api(`/events/${event.id}`, { method: 'PATCH', body })
          : await api('/events', { method: 'POST', body }),
      )
    } catch (err) {
      const errs = fieldErrors(err)
      setErrors({
        ...errs,
        date: errs.starts_at,
        duration: errs.ends_at,
        form: errs.detail ?? errs.non_field_errors,
      })
    } finally {
      setBusy(false)
    }
  }

  async function setPublished(published) {
    setBusy(true)
    try {
      setEvent(await api(`/events/${event.id}/publish`, { method: 'POST', body: { published } }))
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:grid-cols-2 md:divide-x md:divide-gray-300">
      <form onSubmit={saveDraft} className="space-y-4 rounded-lg bg-gray-200 p-6" noValidate>
        <h2 className="text-2xl">Create Event</h2>
        <Input label="Event name" name="title" required maxLength={200}
          value={form.title} onChange={update} error={errors.title} />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Date" name="date" type="date" required
            value={form.date} onChange={update} error={errors.date} />
          <Input label="Time" name="time" type="time" required
            value={form.time} onChange={update} />
          <Input label="Duration (h)" name="duration" type="number" min="0.5" step="0.5" required
            value={form.duration} onChange={update} error={errors.duration} />
        </div>
        <p className="text-xs text-gray-600">
          Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
        <Input label="Location" name="venue" required maxLength={300}
          value={form.venue} onChange={update} error={errors.venue} />
        <Input label="Category" name="category" list="categories" maxLength={50}
          value={form.category} onChange={update} error={errors.category} />
        <datalist id="categories">
          {CATEGORIES.map((c) => <option key={c} value={c} />)}
        </datalist>
        {/* Not in the wireframe, but capacity is required by POST /events */}
        <Input label="Capacity" name="capacity" type="number" min="1" max="1000000" required
          value={form.capacity} onChange={update} error={errors.capacity} />
        <label className="block">
          <span className="text-sm">Description</span>
          <textarea name="description" rows={3} value={form.description} onChange={update}
            className="mt-1 w-full rounded bg-gray-50 px-3 py-2" />
        </label>
        {errors.form && <p role="alert" className="text-sm text-red-600">{errors.form}</p>}
        <button disabled={busy || event?.published}
          className="rounded bg-black px-5 py-2 text-white disabled:opacity-50">
          {event ? 'Save changes' : 'Save draft'}
        </button>
      </form>

      {/* "Event builder": live preview of what attendees will see + publish controls */}
      <section className="md:pl-8" aria-label="Event builder">
        <p className="text-sm uppercase tracking-wide text-gray-500">Preview</p>
        <article className="mt-3 rounded-xl border bg-white p-6">
          {form.category && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">{form.category}</span>
          )}
          <h3 className="mt-3 text-2xl font-semibold">{form.title || 'Event name'}</h3>
          <p className="mt-2 text-gray-600">
            {range.starts_at ? dateFmt.format(new Date(range.starts_at)) : 'Date & time'}
            {' · '}
            {form.venue || 'Location'}
          </p>
          {form.description && <p className="mt-4 whitespace-pre-line">{form.description}</p>}
        </article>

        {event && (
          <div className="mt-6 space-y-3">
            <p>
              Status:{' '}
              <strong>{event.published ? 'Published' : 'Draft'}</strong>
            </p>
            {event.published ? (
              <>
                <Link to={`/events/${event.id}`} className="text-indigo-600 underline">
                  View public page
                </Link>
                <button type="button" onClick={() => setPublished(false)} disabled={busy}
                  className="ml-4 rounded border px-4 py-2">
                  Unpublish
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setPublished(true)} disabled={busy}
                className="rounded bg-indigo-600 px-5 py-2 text-white disabled:opacity-50">
                Publish
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default CreateEvent
