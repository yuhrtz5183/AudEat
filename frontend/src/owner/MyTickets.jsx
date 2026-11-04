import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchMyTickets } from '../api/owner.js'
import { HomeShell } from '../home/Home.jsx'
import { formatDate } from './dates.js'
import { TicketDeadline, TicketStatus } from './TicketStatus.jsx'

// Loads the store's tickets; retry() refetches after a failure.
function useMyTickets() {
  const [state, setState] = useState({ status: 'loading', tickets: [] })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading', tickets: [] })
    fetchMyTickets().then(
      (tickets) => {
        if (active) setState({ status: 'ready', tickets })
      },
      () => {
        if (active) setState({ status: 'error', tickets: [] })
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
      <Link className="ticket-title" to={`/my-store/tickets/${ticket.id}`}>
        {ticket.issue.requirement}
      </Link>
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
        {ticket.issue.comment ? (
          <div>
            <dt>Inspector's comment</dt>
            <dd>{ticket.issue.comment}</dd>
          </div>
        ) : null}
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
    </li>
  )
}

// The store's tickets in the API's order: open ones by nearest deadline, so overdue ones
// come first, then approved ones (AC 4.1, 10.1, 10.2).
export default function MyTickets() {
  const { status, tickets, retry } = useMyTickets()
  const open = tickets.filter((ticket) => ticket.status !== 'approved')
  const resolved = tickets.filter((ticket) => ticket.status === 'approved')

  return (
    <HomeShell title="Remediation tickets">
      {status === 'loading' ? <p className="lede">Loading your tickets…</p> : null}
      {status === 'error' ? (
        <p className="lede">
          Couldn't load your tickets.{' '}
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      ) : null}
      {status === 'ready' && tickets.length === 0 ? (
        <p className="lede">No remediation tickets</p>
      ) : null}
      {status === 'ready' && tickets.length > 0 ? (
        <>
          <p className="lede">Nearest deadline first.</p>
          {open.length > 0 ? (
            <ul className="ticket-list" aria-label="Open tickets">
              {open.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
            </ul>
          ) : (
            <p className="ticket-count">No open remediation tickets</p>
          )}
          {resolved.length > 0 ? (
            <section className="resolved-tickets" aria-labelledby="resolved-heading">
              <h2 id="resolved-heading">Resolved</h2>
              <ul className="ticket-list" aria-label="Resolved tickets">
                {resolved.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      <Link className="text-button back-link" to="/my-store">Back to my store</Link>
    </HomeShell>
  )
}
