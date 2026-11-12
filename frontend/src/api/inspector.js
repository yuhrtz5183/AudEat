import { request } from './client.js'

/*
 * Inspector endpoints. Response shapes are in the API table of backend/README.md. An empty
 * date input is sent as null, so the API answers with its "required" message.
 */

/** Returns the caller's draft inspection for the store, creating it if needed. */
export function startInspection(storeId) {
  return request(`/api/stores/${storeId}/inspections`, { method: 'POST' })
}

export function fetchInspection(id) {
  return request(`/api/inspections/${id}`)
}

/** Saves one draft result; compliant is true, false or null (not marked yet). */
export function updateResult(id, { compliant, comment }) {
  return request(`/api/results/${id}`, {
    method: 'PUT',
    body: { compliant: compliant ?? null, comment: comment ?? null },
  })
}

/** Attaches one photo to a flagged issue; returns { id }. */
export function uploadIssuePhoto(resultId, file) {
  const body = new FormData()
  body.append('file', file)
  return request(`/api/results/${resultId}/photos`, { method: 'POST', body })
}

export function submitInspection(id) {
  return request(`/api/inspections/${id}/submit`, { method: 'POST' })
}

/** The store's submitted inspections, newest first. */
export function fetchStoreInspections(storeId) {
  return request(`/api/stores/${storeId}/inspections`)
}

export function createTicket(resultId, { requiredRemediation, deadline }) {
  return request(`/api/results/${resultId}/ticket`, {
    method: 'POST',
    body: { requiredRemediation, deadline: deadline || null },
  })
}

/** Tickets across all stores with the given status, e.g. 'awaiting_review'. */
export function fetchTickets(status) {
  return request(`/api/tickets?${new URLSearchParams({ status })}`)
}

export function fetchTicket(id) {
  return request(`/api/tickets/${id}`)
}

/** Reviews the pending submission: decision is 'approved', 'rejected' or 'follow_up'. */
export function reviewTicket(id, { decision, comment, followUpDate }) {
  return request(`/api/tickets/${id}/review`, {
    method: 'POST',
    body: { decision, comment, followUpDate: followUpDate || null },
  })
}
