import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import AuthCard, { Field } from '../components/AuthCard'

// /forgot-password — asks the backend to email a reset code.
function ForgotPassword() {
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    try {
      // Same answer whether or not the account exists, so emails cannot be probed.
      await api('/auth/reset-password', { method: 'POST', body: { email: email.trim() }, auth: false })
      setSent(true)
    } catch (err) {
      setErrors({ ...fieldErrors(err), form: err.body?.email ? undefined : err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Reset password"
      footer={
        <Link to="/login" state={location.state} className="text-indigo-600 underline">
          Back to login
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <p role="status">
            If an account exists for <strong>{email.trim()}</strong>, we sent it a reset code. It works for one hour.
          </p>
          <Link to="/reset-password" state={location.state}
            className="block w-full rounded bg-gray-200 py-2.5 text-center text-lg">
            I have the code
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <p className="text-sm text-gray-700">Enter your account email and we will send you a reset code.</p>
          <Field label="Email" name="email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          {errors.form && <p role="alert" className="text-sm text-red-600">{errors.form}</p>}
          <button disabled={submitting} className="w-full rounded bg-gray-200 py-2.5 text-lg disabled:opacity-50">
            {submitting ? 'Sending…' : 'Send reset code'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}

export default ForgotPassword
