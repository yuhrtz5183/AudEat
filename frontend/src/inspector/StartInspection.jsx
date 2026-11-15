import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { startInspection } from '../api/inspector.js'
import { useStores } from '../auth/useStores.js'
import { HomeShell } from '../home/Home.jsx'
import ChecklistEditor from './ChecklistEditor.jsx'

// Starts the caller's draft for this store, or resumes the one they already have (AC 1.1).
export default function StartInspection() {
  const { storeId } = useParams()
  const navigate = useNavigate()
  const stores = useStores(true)
  const store = stores.items.find((item) => String(item.id) === storeId)
  const [inspection, setInspection] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!store) return undefined
    let active = true
    startInspection(storeId).then(
      (draft) => {
        if (active) setInspection(draft)
      },
      () => {
        if (active) setFailed(true)
      },
    )
    return () => {
      active = false
    }
  }, [store, storeId])

  if (stores.status === 'ready' && !store) {
    return (
      <HomeShell title="Store not found">
        <p className="lede">This store could not be found.</p>
        <Link className="action-link" to="/stores">Back to stores</Link>
      </HomeShell>
    )
  }

  return (
    <HomeShell title="New inspection">
      {store ? <h2 className="store-name">{store.name}</h2> : null}
      {store ? <p className="store-address">{store.address}</p> : null}
      {stores.status === 'loading' || (store && !inspection && !failed) ? (
        <p className="lede">Starting the inspection…</p>
      ) : null}
      {stores.status === 'error' || failed ? (
        <p className="lede">Couldn't start the inspection. Go back to the store and try again.</p>
      ) : null}
      {inspection ? (
        <ChecklistEditor
          inspection={inspection}
          onSubmitted={(submitted) =>
            navigate(`/inspections/${submitted.id}`, { state: { submitted: true } })
          }
        />
      ) : null}
      <Link className="text-button back-link" to={store ? `/stores/${store.id}` : '/stores'}>
        Back to {store ? 'store' : 'stores'}
      </Link>
    </HomeShell>
  )
}
