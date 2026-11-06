import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchMyInspections } from '../api/owner.js'
import { HomeShell } from '../home/Home.jsx'
import { NO_INSPECTIONS } from '../remediation/labels.js'
import { formatDate } from './dates.js'

// Loads the store's history; retry() refetches after a failure.
function useMyInspections() {
  const [state, setState] = useState({ status: 'loading', inspections: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading', inspections: [] })
    fetchMyInspections().then(
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
  }, [attempt])

  return { ...state, retry: () => setAttempt((current) => current + 1) }
}

export function violationsText(count) {
  if (count === 0) return 'No violations'
  return `${count} ${count === 1 ? 'violation' : 'violations'}`
}

function InspectionRow({ inspection }) {
  return (
    <li className="ticket-card">
      <p className="ticket-issue">
        <time dateTime={inspection.inspectionDate}>{formatDate(inspection.inspectionDate)}</time>
        {inspection.followUp ? (
          <>
            {' '}
            <span className="badge history-badge">Follow-up inspection</span>
          </>
        ) : null}
      </p>
      <dl className="ticket-facts">
        <div>
          <dt>Violations</dt>
          <dd>{violationsText(inspection.violationCount)}</dd>
        </div>
        <div>
          <dt>Inspector</dt>
          <dd>{inspection.inspectorName}</dd>
        </div>
      </dl>
    </li>
  )
}

// The store's completed inspections in the API's order, newest first (AC 9.1). There is no
// store to choose: the API always answers for the owner's own store (AC 9.2).
export default function MyInspections() {
  const { status, inspections, retry } = useMyInspections()

  return (
    <HomeShell title="Inspection history">
      {status === 'loading' ? <p className="lede">Loading your inspection history…</p> : null}
      {status === 'error' ? (
        <p className="lede">
          Couldn't load your inspection history.{' '}
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      ) : null}
      {status === 'ready' && inspections.length === 0 ? (
        <p className="lede">{NO_INSPECTIONS}</p>
      ) : null}
      {status === 'ready' && inspections.length > 0 ? (
        <>
          <p className="lede">Newest first.</p>
          <ul className="ticket-list" aria-label="Inspections">
            {inspections.map((inspection) => (
              <InspectionRow key={inspection.id} inspection={inspection} />
            ))}
          </ul>
        </>
      ) : null}
      <Link className="text-button back-link" to="/my-store">Back to my store</Link>
    </HomeShell>
  )
}
