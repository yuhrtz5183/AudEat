import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { fetchMyTicket } from '../api/owner.js'
import Photo from '../components/Photo.jsx'
import { HomeShell } from '../home/Home.jsx'
import { ACTION_REQUIRED, rejectionReason, ticketStatusLabel } from '../remediation/labels.js'
import { formatDate, formatInstantDate } from './dates.js'
import EvidenceForm, { acceptsEvidence } from './EvidenceForm.jsx'
import { TicketDeadline, TicketStatus } from './TicketStatus.jsx'

const DECISION_LABEL = {
  approved: 'Approved',
  rejected: 'Rejected',
  follow_up: 'Follow-up inspection needed',
}

// Loads one of the store's tickets; a 404 (missing, or another store's) is "not found".
function useMyTicket(ticketId) {
  const [state, setState] = useState({ status: 'loading', ticket: null })
  const [attempt, setAttempt] = useState(0)
  const current = useRef(ticketId)

  useEffect(() => {
    current.current = ticketId
  }, [ticketId])

  useEffect(() => {
    // The router decodes %2F, so a crafted id like "..%2F..%2Fmy-store" would point the
    // request at another API path. Only plain ids are fetched.
    if (!/^\d+$/.test(ticketId)) {
      setState({ status: 'notFound', ticket: null })
      return undefined
    }
    let active = true
    setState({ status: 'loading', ticket: null })
    fetchMyTicket(ticketId).then(
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
    // A write (sending evidence) answers with the updated ticket.
    replace: (ticket) => setState({ status: 'ready', ticket }),
    // Fetches the ticket again but keeps the current one on screen meanwhile, so the page
    // (and the focused button) stays put. Resolves to whether the fresh ticket is shown.
    refresh: async () => {
      const id = ticketId
      try {
        const ticket = await fetchMyTicket(id)
        if (current.current !== id) return false
        setState({ status: 'ready', ticket })
        return true
      } catch {
        // Let the normal load say "not found" or offer to try again.
        if (current.current === id) setAttempt((count) => count + 1)
        return false
      }
    },
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

function Submission({ submission }) {
  return (
    <li className="ticket-card">
      <p className="submission-date">
        Sent on{' '}
        <time dateTime={submission.submittedAt}>{formatInstantDate(submission.submittedAt)}</time>
      </p>
      <p>{submission.comment}</p>
      <Photos ids={submission.evidencePhotoIds} label="Evidence photo" empty="No evidence photos." />
      <dl className="ticket-facts">
        <div>
          <dt>Inspector's decision</dt>
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
  )
}

function FollowUp({ followUp }) {
  return (
    <li className="ticket-card">
      <dl className="ticket-facts">
        <div>
          <dt>Inspected on</dt>
          <dd>
            <time dateTime={followUp.inspectionDate}>{formatDate(followUp.inspectionDate)}</time>
          </dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>{followUp.compliant ? 'Issue fixed' : 'Issue not fixed'}</dd>
        </div>
        {followUp.comment ? (
          <div>
            <dt>Inspector's comment</dt>
            <dd>{followUp.comment}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  )
}

function TicketDetails({ ticket, onEvidenceSent, onReload }) {
  const reason = ticket.status === 'rejected' ? rejectionReason(ticket) : null
  // Scheduled follow-ups show as the follow-up date; only completed ones have a result.
  const followUps = ticket.followUps.filter((followUp) => followUp.status === 'submitted')

  return (
    <>
      {ticket.status === 'rejected' ? (
        <p className="alert action-required">
          {ACTION_REQUIRED}
          {reason ?? 'the inspector rejected the remediation.'}
        </p>
      ) : null}

      <section className="ticket-section" aria-labelledby="issue-heading">
        <h2 id="issue-heading">Flagged issue</h2>
        <p className="ticket-issue">{ticket.issue.requirement}</p>
        <dl className="ticket-facts">
          <div>
            <dt>Found on</dt>
            <dd>
              <time dateTime={ticket.inspectionDate}>{formatDate(ticket.inspectionDate)}</time>
            </dd>
          </div>
          {ticket.issue.comment ? (
            <div>
              <dt>Inspector's comment</dt>
              <dd>{ticket.issue.comment}</dd>
            </div>
          ) : null}
        </dl>
        <Photos
          ids={ticket.issue.photoIds}
          label="Issue photo"
          empty="No photos were taken of this issue."
        />
      </section>

      <section className="ticket-section" aria-labelledby="remediation-heading">
        <h2 id="remediation-heading">Remediation</h2>
        <dl className="ticket-facts">
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
          {ticket.followUpDate ? (
            <div>
              <dt>Follow-up inspection</dt>
              <dd>
                <time dateTime={ticket.followUpDate}>{formatDate(ticket.followUpDate)}</time>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {ticket.submissions.length > 0 ? (
        <section className="ticket-section" aria-labelledby="submissions-heading">
          <h2 id="submissions-heading">Your evidence</h2>
          <ul className="ticket-list" aria-label="Your evidence">
            {ticket.submissions.map((submission) => (
              <Submission key={submission.id} submission={submission} />
            ))}
          </ul>
        </section>
      ) : null}

      {followUps.length > 0 ? (
        <section className="ticket-section" aria-labelledby="follow-ups-heading">
          <h2 id="follow-ups-heading">Follow-up inspections</h2>
          <ul className="ticket-list" aria-label="Follow-up inspections">
            {followUps.map((followUp) => (
              <FollowUp key={followUp.inspectionId} followUp={followUp} />
            ))}
          </ul>
        </section>
      ) : null}

      {acceptsEvidence(ticket) ? (
        <EvidenceForm ticket={ticket} onSent={onEvidenceSent} onReload={onReload} />
      ) : null}
    </>
  )
}

// One of the store's tickets: the issue, the inspector's comments and photos, the status
// and deadline (AC 4.2), and while the ticket waits for evidence, the form to send it (US 5).
export default function MyTicket() {
  const { ticketId } = useParams()
  const { status, ticket, retry, replace, refresh } = useMyTicket(ticketId)
  // The confirmation belongs to the ticket it was sent for.
  const [sent, setSent] = useState(null)
  const sentRef = useRef(null)
  // { ticketId } after the form's "Reload the ticket"; a new object each time, so every
  // reload moves focus.
  const [reloaded, setReloaded] = useState(null)
  const reloadedRef = useRef(null)

  useEffect(() => {
    // The form, and the button that had focus, are gone; keep the keyboard on the page.
    if (sent !== null) sentRef.current?.focus()
  }, [sent])

  useEffect(() => {
    // Same after a reload: the form is usually gone, so say what the ticket's status is now.
    if (reloaded !== null) reloadedRef.current?.focus()
  }, [reloaded])

  function onEvidenceSent(updated) {
    replace(updated)
    setReloaded(null)
    setSent(ticketId)
  }

  async function onReload() {
    if (!(await refresh())) return
    setSent(null)
    setReloaded({ ticketId })
  }

  return (
    <HomeShell title={status === 'notFound' ? 'Ticket not found' : 'Remediation ticket'}>
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
          <div role="status">
            {sent === ticketId ? (
              <p className="notice evidence-sent" tabIndex={-1} ref={sentRef}>
                Evidence sent. The inspector will review it.
              </p>
            ) : null}
            {reloaded?.ticketId === ticketId ? (
              <p className="notice ticket-reloaded" tabIndex={-1} ref={reloadedRef}>
                Ticket reloaded. Its status is {ticketStatusLabel(ticket)}.
              </p>
            ) : null}
          </div>
          <TicketDetails ticket={ticket} onEvidenceSent={onEvidenceSent} onReload={onReload} />
        </>
      ) : null}
      <Link className="text-button back-link" to="/my-store/tickets">Back to my tickets</Link>
    </HomeShell>
  )
}
