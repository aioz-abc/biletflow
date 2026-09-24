import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth'

export default function RequireOrganizer({ children }) {
  const { user, isOrganizer } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
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
