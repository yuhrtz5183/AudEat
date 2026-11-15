import {
  HttpError,
  TICKET_STATUSES,
  conflict,
  findById,
  inspectionDetail,
  inspectionOf,
  inspectionSummary,
  isEditableBy,
  notFound,
  nowInstant,
  storeHistory,
  ticketDetail,
  ticketSummary,
  ticketsWithStatus,
} from '../data.js'

export const inspectorRoutes = [
  // I2: any submitted inspection, any follow-up draft, and the caller's own regular draft.
  {
    method: 'GET',
    pattern: /^\/api\/inspections\/(?<inspectionId>[^/]+)$/,
    role: 'inspector',
    handler({ db, user, today }, { inspectionId }) {
      const inspection = findById(db.inspections, inspectionId)
      if (!inspection || (inspection.status === 'draft' && !isEditableBy(inspection, user))) {
        throw notFound('Inspection not found.')
      }
      return { status: 200, body: inspectionDetail(db, inspection, today) }
    },
  },
  // I6
  {
    method: 'GET',
    pattern: /^\/api\/stores\/(?<storeId>[^/]+)\/inspections$/,
    role: 'inspector',
    handler({ db }, { storeId }) {
      if (!findById(db.stores, storeId)) throw notFound('Store not found.')
      return {
        status: 200,
        body: storeHistory(db, storeId).map((inspection) => inspectionSummary(db, inspection)),
      }
    },
  },
  // I8
  {
    method: 'GET',
    pattern: /^\/api\/tickets$/,
    role: 'inspector',
    handler({ db, today }, _params, _body, query) {
      const status = query.get('status')
      if (!TICKET_STATUSES.includes(status)) throw new HttpError(400, { message: 'Unknown ticket status.' })
      return { status: 200, body: ticketsWithStatus(db, status).map((ticket) => ticketSummary(db, ticket, today)) }
    },
  },
  // I9
  {
    method: 'GET',
    pattern: /^\/api\/tickets\/(?<ticketId>[^/]+)$/,
    role: 'inspector',
    handler({ db, today }, { ticketId }) {
      const ticket = findById(db.remediationTickets, ticketId)
      if (!ticket) throw notFound('Ticket not found.')
      return { status: 200, body: ticketDetail(db, ticket, today) }
    },
  },
  // US 3: one open ticket for a flagged issue on a submitted inspection.
  {
    method: 'POST',
    pattern: /^\/api\/results\/(?<resultId>[^/]+)\/ticket$/,
    role: 'inspector',
    handler({ db, today }, { resultId }, body) {
      const result = findById(db.inspectionResults, resultId)
      if (!result) throw notFound('Result not found.')
      const inspection = inspectionOf(db, result)
      if (result.compliant !== false || inspection.status !== 'submitted') {
        throw conflict('Only a flagged issue on a submitted inspection can have a remediation ticket.')
      }
      if (db.remediationTickets.some((ticket) => ticket.resultId === result.id)) {
        throw conflict('This issue already has a remediation ticket.')
      }

      const text = typeof body?.requiredRemediation === 'string' ? body.requiredRemediation.trim() : ''
      const errors = {}
      if (!text) errors.requiredRemediation = 'Describe the required remediation.'
      else if (text.length > 1000) errors.requiredRemediation = 'Use 1000 characters or fewer.'
      if (!body?.deadline) errors.deadline = 'A deadline is required.'
      if (Object.keys(errors).length > 0) throw new HttpError(400, { errors })

      const ticket = db.insert('remediationTickets', {
        resultId: result.id,
        requiredRemediation: text,
        deadline: body.deadline,
        status: 'open',
        createdAt: nowInstant(),
        approvedAt: null,
      })
      return { status: 201, body: ticketDetail(db, ticket, today) }
    },
  },
]
