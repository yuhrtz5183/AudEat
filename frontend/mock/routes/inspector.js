import {
  HttpError,
  TICKET_STATUSES,
  findById,
  inspectionDetail,
  inspectionSummary,
  isEditableBy,
  notFound,
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
]
