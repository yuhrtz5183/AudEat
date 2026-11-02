import { Link, Navigate, useParams } from 'react-router'
import { useStores } from '../auth/useStores.js'
import { HomeShell } from '../home/Home.jsx'

// Placeholder for StartInspection and InspectionHistory until US 1 and US 8 replace it.
export default function StoreActionPage({ action }) {
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
