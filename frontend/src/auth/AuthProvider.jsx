import { useEffect, useState } from 'react'
import { api, getSession, onSessionChange, setSession } from '../api/client'
import { AuthContext } from './auth'

export default function AuthProvider({ children }) {
  const [session, setState] = useState(getSession)

  useEffect(() => onSessionChange(setState), [])

  async function login(email, password) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    setSession(data)
    return data.user
  }

  async function logout() {
    const current = getSession()
    setSession(null) // log out locally even if the server call fails
    if (current) {
      await api('/auth/logout', {
        method: 'POST',
        body: { refresh: current.refresh },
        auth: false,
      }).catch(() => {})
    }
  }

  const user = session?.user ?? null
  const value = {
    user,
    isOrganizer: Boolean(user?.roles.includes('organizer')),
    login,
    logout,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
