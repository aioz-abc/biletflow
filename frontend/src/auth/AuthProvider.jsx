import { useEffect, useState } from 'react'
import { session } from '../api/client'
import { AuthContext } from './auth'

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(session.getUser)
  // With tokens left from before a reload, wait for /auth/me before routing.
  const [ready, setReady] = useState(() => !session.hasSession())

  useEffect(() => {
    const unsubscribe = session.subscribe(setUser)
    session.restore().catch(() => {}).finally(() => setReady(true))
    return unsubscribe
  }, [])

  async function logout() {
    // Local sign-out always happens; a failed revoke call is not shown.
    await session.logout().catch(() => {})
  }

  const value = {
    user,
    ready,
    isOrganizer: Boolean(user?.roles?.includes('organizer')),
    login: session.login,
    logout,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
