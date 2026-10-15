import { isRole } from './roles.js'

const KEY = 'audeat.session'

// "Keep me signed in" uses localStorage; otherwise the session ends with the tab.
function stores() {
  try {
    return [window.localStorage, window.sessionStorage]
  } catch {
    return []
  }
}

/** Returns the saved { token, user } session, or null when absent, malformed or expired. */
export function readSession() {
  for (const storage of stores()) {
    try {
      const session = JSON.parse(storage.getItem(KEY))
      if (!session?.token || !isRole(session.user?.role)) continue
      const expiresAt = sessionExpiry(session)
      if (expiresAt !== null && expiresAt <= Date.now()) {
        storage.removeItem(KEY)
        continue
      }
      return session
    } catch {
      // Unreadable entry: treat as signed out.
    }
  }
  return null
}

/** Milliseconds timestamp from the token's `exp` claim, or null if the token has none. */
export function sessionExpiry(session) {
  try {
    const payload = session.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const { exp } = JSON.parse(atob(payload))
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

export function saveSession(session, remember) {
  clearSession()
  const [persistent, tab] = stores()
  const storage = remember ? persistent : tab
  storage?.setItem(KEY, JSON.stringify(session))
}

export function clearSession() {
  for (const storage of stores()) storage.removeItem(KEY)
}
