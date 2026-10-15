import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { useStores } from '../auth/useStores.js'

// Landing pages for each role. Store selection (US 14 and 15) builds on these.
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

  return (
    <HomeShell title="Stores">
      <p className="lede">Every store registered in AudEat.</p>
      {stores.status === 'loading' ? <p className="lede">Loading stores…</p> : null}
      {stores.status === 'error' ? (
        <p className="lede">
          Couldn't load stores.{' '}
          <button type="button" className="text-button" onClick={stores.retry}>
            Try again
          </button>
        </p>
      ) : null}
      {stores.status === 'ready' && stores.items.length === 0 ? (
        <p className="lede">No stores are registered yet.</p>
      ) : null}
      {stores.items.length > 0 ? (
        <ul className="store-list" aria-label="Stores">
          {stores.items.map((store) => (
            <li key={store.id}>
              <span className="store-name">{store.name}</span>
              <span className="store-address">{store.address}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </HomeShell>
  )
}

export function OwnerHome() {
  const { user } = useAuth()

  return (
    <HomeShell title={user.storeName ?? 'My store'}>
      <p className="lede">Your remediation tickets and inspection history.</p>
    </HomeShell>
  )
}
