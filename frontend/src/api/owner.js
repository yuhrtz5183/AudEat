import { request } from './client.js'

/*
 * Store owner endpoints. The API always scopes them to the caller's own store,
 * so none of them takes a store id. Response shapes are in the API table of backend/README.md.
 */

/** The owner's store: { id, name, address, openTicketCount, rejectedCount }. */
export function fetchMyStore() {
  return request('/api/my-store')
}

/** The store's tickets, open ones by nearest deadline first, then approved ones. */
export function fetchMyTickets() {
  return request('/api/my-store/tickets')
}

/** One of the store's tickets with its photos, submissions and follow-ups. */
export function fetchMyTicket(id) {
  return request(`/api/my-store/tickets/${id}`)
}

/** Sends remediation evidence (1-5 image files) for review; returns the updated ticket. */
export function submitEvidence(ticketId, { comment, files }) {
  const body = new FormData()
  body.append('comment', comment)
  for (const file of files) body.append('files', file)
  return request(`/api/my-store/tickets/${ticketId}/submissions`, { method: 'POST', body })
}

/** The store's submitted inspections, newest first. */
export function fetchMyInspections() {
  return request('/api/my-store/inspections')
}
