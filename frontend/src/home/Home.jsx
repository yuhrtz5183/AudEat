import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { useAuth } from '../auth/AuthContext.jsx'
import { useStores } from '../auth/useStores.js'

// Landing pages for each role. Store selection (US 14 and 15) builds on these.
const STORE_SELECTION_REQUIRED = 'Select a store before starting an inspection.'

function HomeShell({ title, children }) {
  const { user, signOut } = useAuth()

  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <div className="home">
      <header className="home-bar">
        <span className="brand">AudEat</span>
        <div className="account">
          <span>{user.name}</span>
          <button type="button" className="text-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="home-main">
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  )
}

// Inspectors land on the store list (AC 13.1). Selecting and searching stores is US 14.
export function InspectorHome() {
  const stores = useStores(true)
  const location = useLocation()
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleStores = stores.items.filter((store) =>
    store.name.toLocaleLowerCase().includes(normalizedQuery),
  )

  return (
    <HomeShell title="Stores">
      <p className="lede">Every store registered in AudEat.</p>
      {location.state?.storeSelectionRequired ? (
        <p className="alert" role="alert">
          {STORE_SELECTION_REQUIRED}
        </p>
      ) : null}
      {stores.status === 'loading' ? <p className="lede">Loading stores…</p> : null}
      {stores.status === 'error' ? (
        <p className="lede">
          Couldn't load stores.{' '}
          <button type="button" className="text-button" onClick={stores.retry}>
            Try again
          </button>
        </p>
      ) : null}
      {stores.status === 'ready' && stores.items.length === 0 && normalizedQuery === '' ? (
        <p className="lede">No stores are registered yet.</p>
      ) : null}
      {stores.status === 'ready' && stores.items.length > 0 ? (
        <div className="field store-search">
          <label htmlFor="store-search">Search stores by name</label>
          <input
            id="store-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter a store name"
          />
        </div>
      ) : null}
      {stores.status === 'ready' && visibleStores.length === 0 && normalizedQuery !== '' ? (
        <p className="lede" role="status">No stores found</p>
      ) : null}
      {stores.status === 'ready' && visibleStores.length > 0 ? (
        <ul className="store-list" aria-label="Stores">
          {visibleStores.map((store) => (
            <li key={store.id}>
              <Link className="store-card" to={`/stores/${store.id}`}>
                <span className="store-name">{store.name}</span>
                <span className="store-address">{store.address}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </HomeShell>
  )
}

function StoreActionPage({ action }) {
  const { storeId } = useParams()
  const stores = useStores(true)
  const store = stores.items.find((item) => String(item.id) === storeId)

  if (stores.status === 'ready' && !store) {
    if (action === 'start') {
      return <Navigate to="/stores" replace state={{ storeSelectionRequired: true }} />
    }
    return (
      <HomeShell title="Store not found">
        <p className="lede">This store could not be found.</p>
        <Link className="action-link" to="/stores">Back to stores</Link>
      </HomeShell>
    )
  }

  const title = action === 'start' ? 'New inspection' : 'Inspection history'

  return (
    <HomeShell title={title}>
      {stores.status === 'loading' ? <p className="lede">Loading store…</p> : null}
      {stores.status === 'error' ? (
        <p className="lede">
          Couldn't load the store.{' '}
          <button type="button" className="text-button" onClick={stores.retry}>
            Try again
          </button>
        </p>
      ) : null}
      {store ? (
        <>
          <h2 className="store-name">{store.name}</h2>
          <p className="store-address">{store.address}</p>
          <p className="lede">
            {action === 'start'
              ? 'Inspection creation is not available yet.'
              : 'Inspection history is not available yet.'}
          </p>
        </>
      ) : null}
      <Link className="action-link" to={store ? `/stores/${store.id}` : '/stores'}>
        Back to {store ? 'store' : 'stores'}
      </Link>
    </HomeShell>
  )
}

export function StoreDetails() {
  const { storeId } = useParams()
  const stores = useStores(true)
  const store = stores.items.find((item) => String(item.id) === storeId)

  if (stores.status === 'ready' && !store) {
    return (
      <HomeShell title="Store not found">
        <p className="lede">This store could not be found.</p>
        <Link className="action-link" to="/stores">Back to stores</Link>
      </HomeShell>
    )
  }

  return (
    <HomeShell title={store?.name ?? 'Store details'}>
      {stores.status === 'loading' ? <p className="lede">Loading store…</p> : null}
      {stores.status === 'error' ? (
        <p className="lede">
          Couldn't load the store.{' '}
          <button type="button" className="text-button" onClick={stores.retry}>
            Try again
          </button>
        </p>
      ) : null}
      {store ? (
        <>
          <p className="store-address">{store.address}</p>
          <div className="store-actions">
            <Link className="action-link" to={`/stores/${store.id}/inspections/new`}>
              Start an inspection
            </Link>
            <Link className="action-link secondary-action" to={`/stores/${store.id}/inspections`}>
              View inspection history
            </Link>
          </div>
        </>
      ) : null}
      <Link className="text-button back-link" to="/stores">Back to stores</Link>
    </HomeShell>
  )
}

export function StartInspection() {
  return <StoreActionPage action="start" />
}

export function InspectionHistory() {
  return <StoreActionPage action="history" />
}

export function InspectionWithoutStore() {
  return <Navigate to="/stores" replace state={{ storeSelectionRequired: true }} />
}

export function OwnerHome() {
  const { user } = useAuth()

  return (
    <HomeShell title={user.storeName ?? 'My store'}>
      <p className="lede">Your remediation tickets and inspection history.</p>
    </HomeShell>
  )
}
