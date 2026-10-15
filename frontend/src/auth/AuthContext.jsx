import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { login } from '../api/auth.js'
import { clearSession, readSession, saveSession, sessionExpiry } from './session.js'

// setTimeout overflows above this delay (~24.8 days).
const MAX_TIMEOUT = 2 ** 31 - 1

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession)

  // Sign out when the token expires so guarded pages redirect to login (AC 13.3).
  useEffect(() => {
    const expiresAt = session ? sessionExpiry(session) : null
    if (expiresAt === null) return undefined
    const timer = setTimeout(() => {
      clearSession()
      setSession(null)
    }, Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMEOUT))
    return () => clearTimeout(timer)
  }, [session])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      async signIn(credentials, remember) {
        const next = await login(credentials)
        saveSession(next, remember)
        setSession(next)
        return next.user
      },
      signOut() {
        clearSession()
        setSession(null)
      },
    }),
    [session],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  return useContext(AuthContext)
}
