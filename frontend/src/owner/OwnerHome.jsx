import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { fetchMyStore } from '../api/owner.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { HomeShell } from '../home/Home.jsx'
import { furtherActionText, NOT_AUTHORIZED } from '../remediation/labels.js'

// Loads the owner's store; retry() refetches after a failure.
function useMyStore() {
  const [state, setState] = useState({ status: 'loading', store: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading', store: null })
    fetchMyStore().then(
      (store) => {
        if (active) setState({ status: 'ready', store })
      },
      () => {
        if (active) setState({ status: 'error', store: null })
      },
    )
    return () => {
      active = false
    }
  }, [attempt])

  return { ...state, retry: () => setAttempt((current) => current + 1) }
}

function openTicketsText(count) {
  if (count === 0) return 'No open remediation tickets'
  return `${count} open remediation ${count === 1 ? 'ticket' : 'tickets'}`
}

// Owners land on their store (US 15). RequireRole sends them here from inspector pages.
export default function OwnerHome() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { status, store, retry } = useMyStore()
  // Show the refusal for this visit only: Back or a reload must not repeat it (AC 15.2).
  const [notAuthorized] = useState(() => Boolean(location.state?.notAuthorized))

  useEffect(() => {
    if (location.state?.notAuthorized) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  // The session already knows the store's name, so the heading never starts empty.
  return (
    <HomeShell title={store?.name ?? user.storeName ?? 'My store'}>
      {notAuthorized ? (
        <p className="alert" role="alert">
          {NOT_AUTHORIZED}
        </p>
      ) : null}
      {status === 'loading' ? <p className="lede">Loading your store…</p> : null}
      {status === 'error' ? (
        <p className="lede">
          Couldn't load your store.{' '}
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      ) : null}
      {store ? (
        <>
          <p className="store-address">{store.address}</p>
          <p className="ticket-count">{openTicketsText(store.openTicketCount)}</p>
          {store.rejectedCount > 0 ? (
            <p className="attention">{furtherActionText(store.rejectedCount)}</p>
          ) : null}
          <div className="store-actions">
            <Link className="action-link" to="/my-store/tickets">
              My remediation tickets
            </Link>
            <Link className="action-link secondary-action" to="/my-store/inspections">
              Inspection history
            </Link>
          </div>
        </>
      ) : null}
    </HomeShell>
  )
}
