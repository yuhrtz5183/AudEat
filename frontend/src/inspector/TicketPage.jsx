import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { fetchTicket } from '../api/inspector.js'
import Photo from '../components/Photo.jsx'
import { HomeShell } from '../home/Home.jsx'
import { formatDate, formatInstantDate } from '../owner/dates.js'
import { TicketDeadline, TicketStatus } from '../owner/TicketStatus.jsx'
import { ticketStatusLabel } from '../remediation/labels.js'
import ReviewForm from './ReviewForm.jsx'

const DECISION_LABEL = {
  approved: 'Approved',
  rejected: 'Rejected',
  follow_up: 'Follow-up inspection needed',
}

const RECORDED = {
  approved: 'Remediation approved. The issue is resolved.',
  rejected: 'Sent back to the store owner. Further action is required.',
  follow_up_scheduled:
    'Follow-up scheduled. The issue stays unresolved until that inspection is completed.',
}

function useTicket(ticketId) {
  const [state, setState] = useState({ status: 'loading', ticket: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!/^\d+$/.test(ticketId)) {
      setState({ status: 'notFound', ticket: null })
      return undefined
    }
    let active = true
    setState({ status: 'loading', ticket: null })
    fetchTicket(ticketId).then(
      (ticket) => {
        if (active) setState({ status: 'ready', ticket })
      },
      (error) => {
        if (active) setState({ status: error.status === 404 ? 'notFound' : 'error', ticket: null })
      },
    )
    return () => {
      active = false
    }
  }, [ticketId, attempt])

  return {
    ...state,
    retry: () => setAttempt((current) => current + 1),
    replace: (ticket) => setState({ status: 'ready', ticket }),
  }
}

function Photos({ ids, label, empty }) {
  if (ids.length === 0) return <p className="lede">{empty}</p>
  return (
    <ul className="photo-list" aria-label={label}>
      {ids.map((id, index) => (
        <li key={id}>
          <Photo id={id} alt={`${label} ${index + 1}`} />
        </li>
      ))}
    </ul>
  )
}

// One ticket for review: the issue, the owner's evidence, and the decision while evidence
// is waiting (US 6).
export default function TicketPage() {
  const { ticketId } = useParams()
  const { status, ticket, retry, replace } = useTicket(ticketId)
  const [recorded, setRecorded] = useState(null)
  const recordedRef = useRef(null)

  useEffect(() => {
    if (recorded) recordedRef.current?.focus()
  }, [recorded])

  function onReviewed(updated) {
    replace(updated)
    setRecorded(updated.status)
  }

  return (
    <HomeShell title={ticket?.storeName ?? (status === 'notFound' ? 'Ticket not found' : 'Remediation ticket')}>
      {status === 'loading' ? <p className="lede">Loading the ticket…</p> : null}
      {status === 'notFound' ? <p className="lede">Ticket not found.</p> : null}
      {status === 'error' ? (
        <p className="lede">
          Couldn't load this ticket.{' '}
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      ) : null}
      {ticket ? (
        <>
          {recorded ? (
            <p className="notice evidence-sent" role="status" tabIndex={-1} ref={recordedRef}>
              {RECORDED[recorded]}
            </p>
          ) : null}

          <section className="ticket-section" aria-labelledby="issue-heading">
            <h2 id="issue-heading">Flagged issue</h2>
            <p className="ticket-issue">{ticket.issue.requirement}</p>
            <dl className="ticket-facts">
              <div>
                <dt>Store</dt>
                <dd>{ticket.storeName}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <TicketStatus ticket={ticket} />
                </dd>
              </div>
              <div>
                <dt>Deadline</dt>
                <dd>
                  <TicketDeadline ticket={ticket} />
                </dd>
              </div>
              <div>
                <dt>Required remediation</dt>
                <dd>{ticket.requiredRemediation}</dd>
              </div>
              {ticket.issue.resolved ? (
                <div>
                  <dt>Issue</dt>
                  <dd>Resolved{ticket.approvedAt ? ` on ${formatInstantDate(ticket.approvedAt)}` : ''}</dd>
                </div>
              ) : (
                <div>
                  <dt>Issue</dt>
                  <dd>Unresolved</dd>
                </div>
              )}
            </dl>
            {ticket.issue.comment ? <p>{ticket.issue.comment}</p> : null}
            <Photos ids={ticket.issue.photoIds} label="Issue photo" empty="No photos were taken of this issue." />
          </section>

          <section className="ticket-section" aria-labelledby="evidence-heading">
            <h2 id="evidence-heading">Owner's evidence</h2>
            {ticket.submissions.length === 0 ? (
              <p className="lede">No evidence has been submitted.</p>
            ) : (
              <ul className="ticket-list" aria-label="Owner's evidence">
                {ticket.submissions.map((submission) => (
                  <li key={submission.id} className="ticket-card">
                    <p className="submission-date">
                      Sent on{' '}
                      <time dateTime={submission.submittedAt}>{formatInstantDate(submission.submittedAt)}</time>
                    </p>
                    <p>{submission.comment}</p>
                    <Photos
                      ids={submission.evidencePhotoIds}
                      label="Evidence photo"
                      empty="No evidence photos."
                    />
                    <dl className="ticket-facts">
                      <div>
                        <dt>Decision</dt>
                        <dd>{DECISION_LABEL[submission.decision] ?? 'Waiting for review'}</dd>
                      </div>
                      {submission.reviewComment ? (
                        <div>
                          <dt>Inspector's comment</dt>
                          <dd>{submission.reviewComment}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ticket.followUpDate ? (
            <p className="lede">
              Follow-up inspection on{' '}
              <time dateTime={ticket.followUpDate}>{formatDate(ticket.followUpDate)}</time>. The issue stays
              unresolved until that inspection is completed.
            </p>
          ) : null}

          {ticket.status === 'awaiting_review' ? (
            <ReviewForm ticketId={ticket.id} onReviewed={onReviewed} />
          ) : recorded ? null : (
            <p className="lede">This ticket's status is {ticketStatusLabel(ticket)}.</p>
          )}
        </>
      ) : null}
      <Link className="text-button back-link" to="/tickets">Back to remediation tickets</Link>
    </HomeShell>
  )
}
