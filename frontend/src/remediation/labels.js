// Display text shared by the owner and inspector pages. The API computes overdue
// and the day counts, so these functions only word them.

export const TICKET_STATUS_LABEL = {
  open: 'Open',
  awaiting_review: 'Awaiting review',
  rejected: 'Rejected',
  follow_up_scheduled: 'Follow-up scheduled',
  approved: 'Approved',
}

// Shown as a separate badge next to the status, e.g. "Overdue · Awaiting review" (AC 10.2).
export const OVERDUE_LABEL = 'Overdue'
export const ACTION_REQUIRED = 'Action required: '
export const NO_INSPECTIONS = 'No inspections recorded for this store'
export const NOT_AUTHORIZED = 'You are not authorized to view this page.'

/** The ticket's current status, even when it is overdue (AC 4.1, 4.2). */
export function ticketStatusLabel(ticket) {
  return TICKET_STATUS_LABEL[ticket.status]
}

/**
 * Why a ticket was sent back to the owner (AC 6.2): the inspector's review comment,
 * or the comment of the follow-up inspection that found the issue unfixed.
 */
export function rejectionReason(detail) {
  const decision = detail.submissions.at(-1)?.decision
  if (decision === 'rejected') return detail.submissions.at(-1).reviewComment
  if (decision === 'follow_up') return detail.followUps.at(-1)?.comment ?? null
  return null
}

export function furtherActionText(count) {
  return `${count} ${count === 1 ? 'ticket needs' : 'tickets need'} further action`
}

/** "Due today", "3 days left" or "2 days overdue"; null once approved, when nothing is due. */
export function daysText(ticket) {
  if (ticket.status === 'approved') return null
  if (ticket.overdue) return `${days(ticket.daysOverdue)} overdue`
  if (ticket.daysRemaining === 0) return 'Due today'
  return `${days(ticket.daysRemaining)} left`
}

function days(count) {
  return `${count} ${count === 1 ? 'day' : 'days'}`
}
