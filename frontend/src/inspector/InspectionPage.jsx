import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { fetchInspection } from '../api/inspector.js'
import { HomeShell } from '../home/Home.jsx'
import { formatDate } from '../owner/dates.js'
import Photo from '../components/Photo.jsx'
import { TicketDeadline, TicketStatus } from '../owner/TicketStatus.jsx'
import ChecklistEditor from './ChecklistEditor.jsx'
import CreateTicketForm from './CreateTicketForm.jsx'

function useInspection(inspectionId) {
  const [state, setState] = useState({ status: 'loading', inspection: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!/^\d+$/.test(inspectionId)) {
      setState({ status: 'notFound', inspection: null })
      return undefined
    }
    let active = true
    setState((current) =>
      current.inspection ? current : { status: 'loading', inspection: null },
    )
    fetchInspection(inspectionId).then(
      (inspection) => {
        if (active) setState({ status: 'ready', inspection })
      },
      (error) => {
        if (active) setState({ status: error.status === 404 ? 'notFound' : 'error', inspection: null })
      },
    )
    return () => {
      active = false
    }
  }, [inspectionId, attempt])

  return { ...state, retry: () => setAttempt((current) => current + 1) }
}

function mark(result) {
  if (result.compliant === true) return 'Compliant'
  if (result.compliant === false) return 'Flagged'
  return 'Not marked'
}

// A submitted inspection's checklist. A flagged issue without a ticket can get one (US 3).
export default function InspectionPage() {
  const { inspectionId } = useParams()
  const location = useLocation()
  const { status, inspection: loaded, retry } = useInspection(inspectionId)
  const [finished, setFinished] = useState(null)
  const inspection = finished ?? loaded
  const [createdId, setCreatedId] = useState(null)
  const justSubmitted = finished !== null || location.state?.submitted === true

  return (
    <HomeShell title={inspection?.storeName ?? (status === 'notFound' ? 'Inspection not found' : 'Inspection')}>
      {status === 'loading' ? <p className="lede">Loading the inspection…</p> : null}
      {status === 'notFound' ? <p className="lede">Inspection not found.</p> : null}
      {status === 'error' ? (
        <p className="lede">
          Couldn't load this inspection.{' '}
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      ) : null}
      {inspection ? (
        <>
          <p className="lede">
            <time dateTime={inspection.inspectionDate}>{formatDate(inspection.inspectionDate)}</time>
            {' · '}
            {inspection.inspectorName}
          </p>
          {justSubmitted ? (
            <p className="notice" role="status">Inspection submitted.</p>
          ) : null}
          {createdId ? (
            <p className="notice" role="status">Ticket created. The store owner can see it.</p>
          ) : null}
          {inspection.status === 'draft' ? (
            <ChecklistEditor inspection={inspection} onSubmitted={setFinished} />
          ) : null}
          {inspection.status === 'draft' ? null : (
          <ul className="ticket-list" aria-label="Checklist">
            {inspection.results.map((result) => (
              <li key={result.id} className="ticket-card">
                <div className="result-header">
                  <p className="ticket-issue">{result.requirement}</p>
                  <span
                    className={`badge ${
                      result.compliant === true
                        ? 'badge-compliant'
                        : result.compliant === false
                          ? 'badge-flagged'
                          : ''
                    }`}
                  >
                    {mark(result)}
                  </span>
                </div>
                {result.comment ? (
                  <div className="inspector-comment-box">
                    <span className="comment-label">Inspector note</span>
                    <p className="comment-text">{result.comment}</p>
                  </div>
                ) : null}
                {result.photoIds && result.photoIds.length > 0 ? (
                  <ul className="photo-list" aria-label="Issue photos">
                    {result.photoIds.map((id) => (
                      <li key={id}>
                        <Photo id={id} alt="Issue photo" />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {result.ticket ? (
                  <div className="remediation-box">
                    <div className="remediation-box-header">
                      <span className="remediation-box-title">Remediation ticket</span>
                      <TicketStatus ticket={result.ticket} />
                    </div>
                    <dl className="ticket-facts">
                      <div>
                        <dt>Deadline</dt>
                        <dd>
                          Ticket due <TicketDeadline ticket={result.ticket} />
                        </dd>
                      </div>
                      <div>
                        <dt>Required remediation</dt>
                        <dd>{result.ticket.requiredRemediation}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
                {result.compliant === false && !result.ticket ? (
                  <div className="ticket-action-box">
                    <div className="ticket-action-header">
                      <span className="badge overdue-badge">Action needed</span>
                      <span className="ticket-action-prompt">Create remediation ticket for this violation</span>
                    </div>
                    <CreateTicketForm
                      resultId={result.id}
                      onCreated={() => {
                        setCreatedId(result.id)
                        retry()
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          )}
        </>
      ) : null}
      <Link className="text-button back-link" to={inspection ? `/stores/${inspection.storeId}/inspections` : '/stores'}>
        Back to inspection history
      </Link>
    </HomeShell>
  )
}
