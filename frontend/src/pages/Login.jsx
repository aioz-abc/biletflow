import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { fieldErrors } from '../api/client'
import { useAuth } from '../auth/auth'
import AuthCard, { Field } from '../components/AuthCard'

function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    try {
      await login(form.email, form.password)
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      // Backend answers bad credentials with 403 (auth view has no authenticators), not 401
      const badCredentials = err.status === 401 || err.status === 403
      setErrors({ ...fieldErrors(err), form: badCredentials ? 'Wrong email or password.' : err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Login"
      footer={
        <>
          New to Begemot.com?{' '}
          <Link to="/register" state={location.state} className="text-indigo-600 underline">
            Register
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" required
          value={form.email} onChange={update} error={errors.email} />
        <div className="relative">
          <Field label="Password" name="password" type="password" autoComplete="current-password" required
            value={form.password} onChange={update} error={errors.password} />
          {/* Backend has no password reset yet (BACKEND_MVP_API.md, Accounts) */}
          <button type="button" disabled title="Password reset is not available yet"
            className="absolute right-3 top-2.5 text-sm text-indigo-700 underline opacity-60">
            Forgot?
          </button>
        </div>
        {errors.form && <p role="alert" className="text-sm text-red-600">{errors.form}</p>}
        <button disabled={submitting} className="w-full rounded bg-gray-200 py-2.5 text-lg disabled:opacity-50">
          {submitting ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </AuthCard>
  )
}

export default Login
