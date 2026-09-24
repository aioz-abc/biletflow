import { useNavigate } from 'react-router-dom'

// Modal-style card from the Register/Login wireframes: grey header with
// title + logo dot, a close (X) button outside the card's top-right corner.
export default function AuthCard({ title, children, footer }) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="relative w-full max-w-sm">
        <button
          type="button"
          aria-label="Close"
          onClick={() => navigate('/')}
          className="absolute -right-12 top-2 text-4xl font-thin text-white max-sm:right-2 max-sm:text-gray-700"
        >
          ×
        </button>
        <div className="overflow-hidden rounded-lg bg-gray-100 shadow-xl">
          <header className="flex items-center justify-between border-b border-gray-400 px-8 py-5">
            <h2 className="text-2xl">{title}</h2>
            <span className="h-7 w-7 rounded-full bg-gray-500" aria-hidden="true" />
          </header>
          <div className="space-y-5 px-8 py-6">{children}</div>
          {footer && <p className="pb-5 text-center text-sm">{footer}</p>}
        </div>
      </div>
    </div>
  )
}

export function Field({ label, error, ...props }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        {...props}
        placeholder={label}
        aria-invalid={Boolean(error)}
        className="w-full rounded bg-gray-400 px-3 py-2.5 text-white placeholder:text-white/90 focus:outline-2 focus:outline-indigo-500"
      />
      {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}
