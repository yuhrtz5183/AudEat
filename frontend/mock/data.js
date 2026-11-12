// In-memory tables shaped like the V3 schema, plus the DTO builders, derived values and
// state transitions of the backend (DESIGN §1-§4). Statuses are stored in their JSON form.

export const TICKET_STATUSES = ['open', 'awaiting_review', 'rejected', 'follow_up_scheduled', 'approved']

export class HttpError extends Error {
  constructor(status, body) {
    super(body.message ?? `HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

export const notFound = (message) => new HttpError(404, { message })
export const conflict = (message) => new HttpError(409, { message })

/** Empty tables. `insert` gives new rows the next numeric id, as the database does. */
export function createTables(stores) {
  const lastIds = {}
  return {
    stores,
    users: [],
    checklistRequirements: [],
    inspections: [],
    inspectionResults: [],
    remediationTickets: [],
    remediationSubmissions: [],
    photos: [],
    insert(table, row) {
      const id = row.id ?? (lastIds[table] ?? 0) + 1
      lastIds[table] = Math.max(lastIds[table] ?? 0, id)
      const record = { ...row, id }
      this[table].push(record)
      return record
    },
  }
}

/** A user row as the API returns it: everything but the password. */
// The backend sends storeId as a number; the mock keeps store ids as strings internally.
export function publicUser({ password: _password, ...user }) {
  return { ...user, storeId: user.storeId == null ? null : Number(user.storeId) }
}

export function findById(rows, id) {
  return rows.find((row) => String(row.id) === String(id))
}

// Dates are 'YYYY-MM-DD' strings, which compare correctly as strings.
export function localToday() {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

export function nowInstant() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// Derived ticket values (never stored).

export function isOpen(ticket) {
  return ticket.status !== 'approved'
}

/** Strict: a deadline of today is not overdue (AC 11.3). */
export function isOverdue(ticket, today) {
  return isOpen(ticket) && ticket.deadline < today
}

export function daysRemaining(ticket, today) {
  return daysBetween(today, ticket.deadline)
}

export function daysOverdue(ticket, today) {
  return isOverdue(ticket, today) ? -daysRemaining(ticket, today) : 0
}

// Ticket transitions: the same rules and 409 messages as RemediationTicket.

const REVIEW_REFUSED = 'This ticket has no evidence waiting for review.'

function transition(ticket, from, to, message) {
  if (!from.includes(ticket.status)) throw conflict(message)
  ticket.status = to
}

export function submitEvidence(ticket) {
  transition(ticket, ['open', 'rejected'], 'awaiting_review', 'This ticket is not waiting for evidence.')
}

export function approve(ticket, now) {
  transition(ticket, ['awaiting_review'], 'approved', REVIEW_REFUSED)
  ticket.approvedAt = now
}

export function reject(ticket) {
  transition(ticket, ['awaiting_review'], 'rejected', REVIEW_REFUSED)
}

export function scheduleFollowUp(ticket) {
  transition(ticket, ['awaiting_review'], 'follow_up_scheduled', REVIEW_REFUSED)
}

export function recordFollowUpResult(ticket, compliant, now) {
  transition(
    ticket,
    ['follow_up_scheduled'],
    compliant ? 'approved' : 'rejected',
    'This ticket is not waiting for a follow-up inspection.',
  )
  if (compliant) ticket.approvedAt = now
}

export function review(submission, decision, comment, now) {
  if (submission.decision !== null) throw conflict('This submission has already been reviewed.')
  submission.decision = decision
  submission.reviewComment = comment ?? null
  submission.reviewedAt = now
}

// Inspections: the same rules as Inspection.

export function isFollowUp(inspection) {
  return inspection.followUpOfResultId !== null
}

/** Any inspector may edit a follow-up draft; only its own inspector may edit a regular draft. */
export function isEditableBy(inspection, user) {
  return isFollowUp(inspection) || inspection.inspectorId === user.id
}

/** DRAFT → SUBMITTED. A follow-up is re-dated to today and credited to the caller. */
export function submitInspection(inspection, user, today, now) {
  if (inspection.status !== 'draft') throw conflict('This inspection has already been submitted.')
  inspection.status = 'submitted'
  inspection.submittedAt = now
  if (isFollowUp(inspection)) {
    inspection.inspectionDate = today
    inspection.inspectorId = user.id
  }
}

/** A regular draft dated today, with one unmarked result per checklist requirement. */
export function startRegular(db, store, user, today, now) {
  const inspection = insertInspection(db, store.id, user.id, today, null, now)
  for (const requirement of db.checklistRequirements.toSorted((a, b) => a.sortOrder - b.sortOrder)) {
    insertResult(db, inspection.id, requirement.id)
  }
  return inspection
}

/** A follow-up draft on the scheduled date, holding one result for the original requirement. */
export function scheduleFollowUpInspection(db, original, user, date, now) {
  const { storeId } = inspectionOf(db, original)
  const inspection = insertInspection(db, storeId, user.id, date, original.id, now)
  insertResult(db, inspection.id, original.requirementId)
  return inspection
}

function insertInspection(db, storeId, inspectorId, inspectionDate, followUpOfResultId, createdAt) {
  return db.insert('inspections', {
    storeId,
    inspectorId,
    inspectionDate,
    status: 'draft',
    followUpOfResultId,
    createdAt,
    submittedAt: null,
  })
}

function insertResult(db, inspectionId, requirementId) {
  return db.insert('inspectionResults', { inspectionId, requirementId, compliant: null, comment: null })
}

// Navigation, like the JPA associations.

export function inspectionOf(db, result) {
  return findById(db.inspections, result.inspectionId)
}

export function resultOf(db, ticket) {
  return findById(db.inspectionResults, ticket.resultId)
}

export function ticketStoreId(db, ticket) {
  return inspectionOf(db, resultOf(db, ticket)).storeId
}

/** The inspection a photo belongs to, through its flagged issue or its submission. */
export function photoInspection(db, photo) {
  if (photo.resultId !== null) return inspectionOf(db, findById(db.inspectionResults, photo.resultId))
  const submission = findById(db.remediationSubmissions, photo.submissionId)
  return inspectionOf(db, resultOf(db, findById(db.remediationTickets, submission.ticketId)))
}

function ticketForResult(db, resultId) {
  return db.remediationTickets.find((ticket) => ticket.resultId === resultId) ?? null
}

function followUpsOf(db, resultId) {
  return db.inspections.filter((inspection) => inspection.followUpOfResultId === resultId)
}

function photoIds(db, key, parentId) {
  return db.photos.filter((photo) => photo[key] === parentId).map((photo) => photo.id)
}

function violationCount(db, inspectionId) {
  return db.inspectionResults.filter(
    (result) => result.inspectionId === inspectionId && result.compliant === false,
  ).length
}

// DTO builders: exactly the JSON of the backend's response records (DESIGN §4).

export function inspectionSummary(db, inspection) {
  return {
    id: inspection.id,
    inspectionDate: inspection.inspectionDate,
    inspectorName: findById(db.users, inspection.inspectorId).name,
    violationCount: violationCount(db, inspection.id),
    followUp: isFollowUp(inspection),
  }
}

export function resultResponse(db, result, today) {
  const requirement = findById(db.checklistRequirements, result.requirementId)
  const ticket = ticketForResult(db, result.id)
  return {
    id: result.id,
    requirementId: requirement.id,
    requirement: requirement.description,
    compliant: result.compliant,
    comment: result.comment,
    photoIds: photoIds(db, 'resultId', result.id),
    resolved: result.compliant === false ? ticket?.status === 'approved' : null,
    ticket: ticket && {
      id: ticket.id,
      status: ticket.status,
      overdue: isOverdue(ticket, today),
      deadline: ticket.deadline,
      daysRemaining: daysRemaining(ticket, today),
      daysOverdue: daysOverdue(ticket, today),
      requiredRemediation: ticket.requiredRemediation,
    },
  }
}

export function inspectionDetail(db, inspection, today) {
  const store = findById(db.stores, inspection.storeId)
  const original = isFollowUp(inspection) ? ticketForResult(db, inspection.followUpOfResultId) : null
  const sortOrder = (result) => findById(db.checklistRequirements, result.requirementId).sortOrder
  return {
    id: inspection.id,
    storeId: Number(store.id),
    storeName: store.name,
    inspectorName: findById(db.users, inspection.inspectorId).name,
    inspectionDate: inspection.inspectionDate,
    status: inspection.status,
    submittedAt: inspection.submittedAt,
    followUpOfTicketId: original?.id ?? null,
    violationCount: violationCount(db, inspection.id),
    results: db.inspectionResults
      .filter((result) => result.inspectionId === inspection.id)
      .toSorted((a, b) => sortOrder(a) - sortOrder(b))
      .map((result) => resultResponse(db, result, today)),
  }
}

export function ticketSummary(db, ticket, today) {
  const result = resultOf(db, ticket)
  const inspection = inspectionOf(db, result)
  const store = findById(db.stores, inspection.storeId)
  const draftFollowUp = followUpsOf(db, result.id).find((followUp) => followUp.status === 'draft')
  return {
    id: ticket.id,
    status: ticket.status,
    overdue: isOverdue(ticket, today),
    deadline: ticket.deadline,
    daysRemaining: daysRemaining(ticket, today),
    daysOverdue: daysOverdue(ticket, today),
    requiredRemediation: ticket.requiredRemediation,
    issue: {
      resultId: result.id,
      requirement: findById(db.checklistRequirements, result.requirementId).description,
      comment: result.comment,
      resolved: ticket.status === 'approved',
    },
    storeId: Number(store.id),
    storeName: store.name,
    inspectionId: inspection.id,
    inspectionDate: inspection.inspectionDate,
    followUpDate: draftFollowUp?.inspectionDate ?? null,
    followUpInspectionId: draftFollowUp?.id ?? null,
  }
}

// An owner sees a draft follow-up's date and status, but not the inspector's unsubmitted result
// (as TicketViews.ownerDetail; owners never see draft inspection content, like draft photos).
export function ticketDetail(db, ticket, today, { forOwner = false } = {}) {
  const summary = ticketSummary(db, ticket, today)
  const submissions = db.remediationSubmissions
    .filter((submission) => submission.ticketId === ticket.id)
    .toSorted((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id - b.id)
  return {
    ...summary,
    issue: { ...summary.issue, photoIds: photoIds(db, 'resultId', ticket.resultId) },
    createdAt: ticket.createdAt,
    approvedAt: ticket.approvedAt,
    submissions: submissions.map((submission) => ({
      id: submission.id,
      comment: submission.comment,
      submittedAt: submission.submittedAt,
      evidencePhotoIds: photoIds(db, 'submissionId', submission.id),
      decision: submission.decision,
      reviewComment: submission.reviewComment,
      reviewedAt: submission.reviewedAt,
    })),
    followUps: followUpsOf(db, ticket.resultId).map((followUp) => {
      const result = db.inspectionResults.find((row) => row.inspectionId === followUp.id)
      const hidden = forOwner && followUp.status === 'draft'
      return {
        inspectionId: followUp.id,
        inspectionDate: followUp.inspectionDate,
        status: followUp.status,
        compliant: hidden ? null : result.compliant,
        comment: hidden ? null : result.comment,
      }
    }),
  }
}

export function myStoreResponse(db, storeId) {
  const store = findById(db.stores, storeId)
  const tickets = storeTickets(db, storeId)
  return {
    id: Number(store.id),
    name: store.name,
    address: store.address,
    openTicketCount: tickets.filter(isOpen).length,
    rejectedCount: tickets.filter((ticket) => ticket.status === 'rejected').length,
  }
}

// Queries, with the backend's ordering.

/** Submitted inspections of a store, newest first (findHistory). */
export function storeHistory(db, storeId) {
  return db.inspections
    .filter((inspection) => String(inspection.storeId) === String(storeId) && inspection.status === 'submitted')
    .toSorted((a, b) => b.inspectionDate.localeCompare(a.inspectionDate) || b.id - a.id)
}

/** A store's tickets: open ones by nearest deadline (overdue first), then approved (findForStore). */
export function storeTickets(db, storeId) {
  return db.remediationTickets
    .filter((ticket) => String(ticketStoreId(db, ticket)) === String(storeId))
    .toSorted((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || byDeadline(a, b))
}

/** Tickets in one status across all stores, by deadline (findByStatusForInspector). */
export function ticketsWithStatus(db, status) {
  return db.remediationTickets.filter((ticket) => ticket.status === status).toSorted(byDeadline)
}

function byDeadline(a, b) {
  return a.deadline.localeCompare(b.deadline) || a.id - b.id
}
