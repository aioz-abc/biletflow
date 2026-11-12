import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import AuthCard, { Field } from '../components/AuthCard'
import { parseResetCode } from '../utils/resetCode'

// /reset-password?uid=..&token=.. — sets a new password with the emailed code.
// Without the query string the user pastes the email text instead.
function ResetPassword() {
  const location = useLocation()
  const [params] = useSearchParams()
  const fromLink = parseResetCode(`uid=${params.get('uid') ?? ''} token=${params.get('token') ?? ''}`)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    const pair = fromLink ?? parseResetCode(code)
    if (!pair) {
      setErrors({ code: 'Paste both the uid= and token= lines from the email.' })
      return
    }
    setSubmitting(true)
    setErrors({})
    try {
      await api('/auth/reset-password/confirm', {
        method: 'POST',
        body: { ...pair, new_password: password },
        auth: false,
      })
      setDone(true)
    } catch (err) {
      const errs = fieldErrors(err)
      setErrors({
        password: errs.new_password,
        // A used, expired or mistyped code all come back as token/uid errors.
        code: errs.token || errs.uid ? 'This reset code is invalid or has expired. Request a new one.' : undefined,
        form: err.status >= 500 || err.status === 0 || err.status === 429 ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <AuthCard title="Password changed">
        <p role="status">Your password was changed. Log in with the new one.</p>
        <Link to="/login" state={location.state} className="block w-full rounded bg-gray-200 py-2.5 text-center text-lg">
          Login
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="New password"
      footer={
        <Link to="/forgot-password" state={location.state} className="text-indigo-600 underline">
          Send a new code
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {!fromLink && (
          <label className="block">
            <span className="text-sm text-gray-700">Paste the reset email (the uid= and token= lines)</span>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={3} required
              aria-invalid={Boolean(errors.code)} spellCheck={false}
              className="mt-1 w-full rounded bg-gray-400 px-3 py-2 font-mono text-sm text-white focus:outline-2 focus:outline-indigo-500" />
          </label>
        )}
        {errors.code && <p role="alert" className="text-sm text-red-600">{errors.code}</p>}
        <Field label="New password" name="password" type="password" autoComplete="new-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        {errors.form && <p role="alert" className="text-sm text-red-600">{errors.form}</p>}
        <button disabled={submitting} className="w-full rounded bg-gray-200 py-2.5 text-lg disabled:opacity-50">
          {submitting ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </AuthCard>
  )
}

export default ResetPassword
