import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import { formatAmount } from '../utils/money'
import { STATUS_LABELS, STEP_LABELS, missingBeforeFee, payoutReferenceError } from '../utils/activation'

// /organizer/events/:id/activation — paid-sales activation checklist (SRS 4.5, UC2).
// Paid tickets of this event cannot be bought until every step is done.
function EventActivation() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [payout, setPayout] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([api(`/events/${id}`), api(`/events/${id}/activation`)])
      .then(([ev, activation]) => {
        if (!active) return
        setEvent(ev)
        setState(activation)
        setPayout(activation.payout_reference)
      })
      .catch((err) => active && setError(err.status === 404 ? 'Event not found.' : err.message))
    return () => { active = false }
  }, [id])

  async function submit(body, success) {
    if (busy) return
    setBusy(true)
    setErrors({})
    setNotice(null)
    try {
      setState(await api(`/events/${id}/activation`, { method: 'POST', body }))
      setNotice(success)
    } catch (err) {
      const errs = fieldErrors(err)
      setErrors({ payout: errs.payout_reference, form: errs.detail ?? (errs.payout_reference ? undefined : err.message) })
    } finally {
      setBusy(false)
    }
  }

  function connectPayout(e) {
    e.preventDefault()
    const problem = payoutReferenceError(payout)
    if (problem) return setErrors({ payout: problem })
    submit({ payout_reference: payout.trim() }, 'Payout account connected.')
  }

  if (error) return <p role="alert" className="text-red-600">{error}</p>
  if (!state) return <p>Loading…</p>

  const done = Object.fromEntries(state.checklist.map((item) => [item.step, item.done]))
  const missing = missingBeforeFee(state)

  return (
    <main className="max-w-2xl">
      <Link to={`/organizer/events/${id}`} className="text-sm text-gray-500">← {event.title}</Link>
      <h1 className="mt-2 text-3xl font-bold">Paid sales activation</h1>
      <p className="mt-1 text-gray-600">
        Status: <strong>{STATUS_LABELS[state.status]}</strong>. Activation applies to this event only.
      </p>
      <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
        Demo environment: identity, payout account and the {formatAmount(state.fee_minor)} activation
        fee are simulated. No real data is checked and no money is charged.
      </p>
      {state.status === 'suspended' && (
        <p role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm">
          A platform admin suspended paid sales for this event{state.suspension_reason ? `: ${state.suspension_reason}` : '.'}{' '}
          Free tickets and already issued tickets keep working.
        </p>
      )}

      <ol className="mt-6 space-y-3">
        {state.checklist.map((item) => (
          <li key={item.step} className="flex items-start gap-3 rounded-xl border bg-white p-4">
            <span aria-hidden className={item.done ? 'text-green-600' : 'text-gray-400'}>{item.done ? '✓' : '○'}</span>
            <div className="flex-1">
              <p className={item.done ? 'font-medium' : ''}>
                {STEP_LABELS[item.step]}
                <span className="sr-only">{item.done ? ' — done' : ' — not done'}</span>
              </p>
              {item.step === 'paid_ticket_type' && !item.done && (
                <Link to={`/organizer/events/${id}/edit`} className="text-sm text-indigo-600 underline">Add a paid ticket type</Link>
              )}
              {item.step === 'identity_verified' && !item.done && (
                <button disabled={busy} onClick={() => submit({ identity_confirmed: true }, 'Identity verified.')}
                  className="mt-2 rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
                  Run simulated verification
                </button>
              )}
              {item.step === 'payout_account' && (
                <form onSubmit={connectPayout} className="mt-2 flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="payout">Simulated payout reference</label>
                  <input id="payout" value={payout} onChange={(e) => setPayout(e.target.value)} maxLength={64}
                    placeholder="SIM-PAYOUT-1" className="rounded border px-3 py-1.5 text-sm"
                    aria-invalid={Boolean(errors.payout)} aria-describedby={errors.payout ? 'payout-error' : undefined} />
                  <button disabled={busy} className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
                    {item.done ? 'Update' : 'Connect'}
                  </button>
                  {errors.payout && <p id="payout-error" className="w-full text-sm text-red-600">{errors.payout}</p>}
                </form>
              )}
              {item.step === 'terms_accepted' && !item.done && (
                <button disabled={busy} onClick={() => submit({ accept_terms: true }, 'Terms accepted.')}
                  className="mt-2 rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
                  Accept paid-event terms
                </button>
              )}
              {item.step === 'fee_paid' && !done.fee_paid && (
                <div className="mt-2">
                  <button disabled={busy || missing.length > 0}
                    onClick={() => submit({ pay_fee: 'success' }, 'Activation fee paid. Paid tickets are on sale.')}
                    className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                    Pay {formatAmount(state.fee_minor)} (simulated)
                  </button>
                  {missing.length > 0 && <p className="mt-1 text-sm text-gray-600">Complete the steps above first.</p>}
                </div>
              )}
              {item.step === 'fee_paid' && done.fee_paid && state.fee_reference && (
                <p className="text-xs text-gray-500">Simulation reference {state.fee_reference}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {notice && <p role="status" className="mt-4 text-green-700">{notice}</p>}
      {errors.form && <p role="alert" className="mt-4 text-red-600">{errors.form}</p>}
    </main>
  )
}

export default EventActivation
