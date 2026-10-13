import { Link } from 'react-router-dom'
import { useAuth } from './auth'
import RequireAuth from './RequireAuth.jsx'

function OrganizerOnly({ children }) {
  const { isOrganizer } = useAuth()

  if (!isOrganizer) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold">Organizer account required</h2>
        <p className="mt-4 text-gray-600">
          Only organizer accounts can create events.{' '}
          <Link to="/register" className="text-indigo-600 underline">
            Register as an organizer
          </Link>
        </p>
      </main>
    )
  }
  return children
}

export default function RequireOrganizer({ children }) {
  return (
    <RequireAuth>
      <OrganizerOnly>{children}</OrganizerOnly>
    </RequireAuth>
  )
}
