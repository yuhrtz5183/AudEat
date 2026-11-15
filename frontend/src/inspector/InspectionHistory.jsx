import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { fetchStoreInspections } from '../api/inspector.js'
import { useStores } from '../auth/useStores.js'
import { HomeShell } from '../home/Home.jsx'
import { formatDate } from '../owner/dates.js'
import { violationsText } from '../owner/MyInspections.jsx'
import { NO_INSPECTIONS } from '../remediation/labels.js'

function useHistory(storeId) {
  const [state, setState] = useState({ status: 'loading', inspections: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading', inspections: [] })
    fetchStoreInspections(storeId).then(
      (inspections) => {
        if (active) setState({ status: 'ready', inspections })
      },
      () => {
        if (active) setState({ status: 'error', inspections: [] })
      },
    )
    return () => {
      active = false
    }
  }, [storeId, attempt])

  return { ...state, retry: () => setAttempt((current) => current + 1) }
}

// Submitted inspections for the store the inspector selected, newest first.
export default function InspectionHistory() {
  const { storeId } = useParams()
  const stores = useStores(true)
  const store = stores.items.find((item) => String(item.id) === storeId)
  const { status, inspections, retry } = useHistory(storeId)

  return (
    <HomeShell title="Inspection history">
      {store ? <h2 className="store-name">{store.name}</h2> : null}
      {stores.status === 'ready' && !store ? <p className="lede">This store could not be found.</p> : null}
      {status === 'loading' ? <p className="lede">Loading inspection history…</p> : null}
      {status === 'error' ? (
        <p className="lede">
          Couldn't load inspection history.{' '}
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      ) : null}
      {status === 'ready' && inspections.length === 0 ? <p className="lede">{NO_INSPECTIONS}</p> : null}
      {status === 'ready' && inspections.length > 0 ? (
        <ul className="ticket-list" aria-label="Inspections">
          {inspections.map((inspection) => (
            <li key={inspection.id} className="ticket-card">
              <Link className="ticket-title" to={`/inspections/${inspection.id}`}>
                <time dateTime={inspection.inspectionDate}>{formatDate(inspection.inspectionDate)}</time>
                {' · '}
                {violationsText(inspection.violationCount)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link className="text-button back-link" to={store ? `/stores/${store.id}` : '/stores'}>
        Back to {store ? 'store' : 'stores'}
      </Link>
    </HomeShell>
  )
}
