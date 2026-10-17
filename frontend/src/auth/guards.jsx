import { Navigate, Outlet } from 'react-router'
import { useAuth } from './AuthContext.jsx'
import { ROLE_HOME } from './roles.js'

// Signed-out users go to login; users of another role go to their own home.
export function RequireRole({ role }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={ROLE_HOME[user.role]} replace />
  return <Outlet />
}

// Login and registration are only for signed-out users.
export function GuestOnly() {
  const { user } = useAuth()
  return user ? <Navigate to={ROLE_HOME[user.role]} replace /> : <Outlet />
}

export function Fallback() {
  const { user } = useAuth()
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />
}
