import { useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import { HomeShell } from '../home/Home.jsx'
import { NOT_AUTHORIZED } from '../remediation/labels.js'

// Owners land on their store (US 15). RequireRole sends them here from inspector pages.
export default function OwnerHome() {
  const { user } = useAuth()
  const location = useLocation()

  return (
    <HomeShell title={user.storeName ?? 'My store'}>
      <p className="lede">Your remediation tickets and inspection history.</p>
      {location.state?.notAuthorized ? (
        <p className="alert" role="alert">
          {NOT_AUTHORIZED}
        </p>
      ) : null}
    </HomeShell>
  )
}
