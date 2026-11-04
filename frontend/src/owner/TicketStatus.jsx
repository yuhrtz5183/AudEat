import { daysText, OVERDUE_LABEL, ticketStatusLabel } from '../remediation/labels.js'
import { formatDate } from './dates.js'

// The current status always shows; an overdue ticket gets an "Overdue" badge before it,
// e.g. "Overdue · Open" (AC 4.1, 10.2). The API decides what is overdue.
export function TicketStatus({ ticket }) {
  return (
    <span className="ticket-status">
      {ticket.overdue ? (
        <>
          <span className="badge overdue-badge">{OVERDUE_LABEL}</span>
          <span aria-hidden="true"> · </span>
        </>
      ) : null}
      <span className={`badge status-${ticket.status}`}>{ticketStatusLabel(ticket)}</span>
    </span>
  )
}

/** The deadline date plus "2 days overdue", "Due today" or "3 days left" (AC 10.1). */
export function TicketDeadline({ ticket }) {
  const days = daysText(ticket)
  return (
    <>
      <time dateTime={ticket.deadline}>{formatDate(ticket.deadline)}</time>
      {days ? (
        <span className={ticket.overdue ? 'days-left overdue-text' : 'days-left'}>{days}</span>
      ) : null}
    </>
  )
}
