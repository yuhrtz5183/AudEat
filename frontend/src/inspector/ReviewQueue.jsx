import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchTickets } from '../api/inspector.js'
import { HomeShell } from '../home/Home.jsx'
import { TicketDeadline, TicketStatus } from '../owner/TicketStatus.jsx'

function useQueues() {
  const [state, setState] = useState({ status: 'loading', awaiting: [], followUps: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading', awaiting: [], followUps: [] })
    Promise.all([fetchTickets('awaiting_review'), fetchTickets('follow_up_scheduled')]).then(
      ([awaiting, followUps]) => {
        if (active) setState({ status: 'ready', awaiting, followUps })
      },
      () => {
        if (active) setState({ status: 'error', awaiting: [], followUps: [] })
      },
    )
    return () => {
      active = false
    }
  }, [attempt])

  return { ...state, retry: () => setAttempt((current) => current + 1) }
}

function TicketCard({ ticket }) {
  return (
    <li className="ticket-card">
      <Link className="ticket-title" to={`/tickets/${ticket.id}`}>
        {ticket.issue.requirement}
      </Link>
      <p className="store-address">{ticket.storeName}</p>
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
      </dl>
      {ticket.followUpInspectionId ? (
        <Link className="action-link" to={`/inspections/${ticket.followUpInspectionId}`}>
          Complete follow-up
        </Link>
      ) : null}
    </li>
  )
}

function Queue({ id, title, tickets, empty, label }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {tickets.length === 0 ? (
        <p className="lede">{empty}</p>
      ) : (
        <ul className="ticket-list" aria-label={label}>
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      )}
    </section>
  )
}

// Tickets whose evidence is waiting (US 6) and follow-ups already scheduled (AC 6.3, 7.3).
export default function ReviewQueue() {
  const { status, awaiting, followUps, retry } = useQueues()

  return (
    <HomeShell title="Remediation tickets">
      {status === 'loading' ? <p className="lede">Loading tickets…</p> : null}
      {status === 'error' ? (
        <p className="lede">
          Couldn't load tickets.{' '}
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      ) : null}
      {status === 'ready' ? (
        <>
          <Queue
            id="awaiting-review"
            title="Awaiting review"
            tickets={awaiting}
            empty="No tickets are waiting for review."
            label="Tickets awaiting review"
          />
          <Queue
            id="follow-ups-scheduled"
            title="Follow-ups scheduled"
            tickets={followUps}
            empty="No follow-ups are scheduled."
            label="Scheduled follow-ups"
          />
        </>
      ) : null}
      <Link className="text-button back-link" to="/stores">Back to stores</Link>
    </HomeShell>
  )
}
