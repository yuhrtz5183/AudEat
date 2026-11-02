import {
  findById,
  inspectionSummary,
  myStoreResponse,
  notFound,
  storeHistory,
  storeTickets,
  ticketDetail,
  ticketStoreId,
  ticketSummary,
} from '../data.js'

// Owner routes always use the caller's store; a record of another store is "not found".
export const ownerRoutes = [
  // O1
  {
    method: 'GET',
    pattern: /^\/api\/my-store$/,
    role: 'owner',
    handler: ({ db, user }) => ({ status: 200, body: myStoreResponse(db, user.storeId) }),
  },
  // O2
  {
    method: 'GET',
    pattern: /^\/api\/my-store\/tickets$/,
    role: 'owner',
    handler: ({ db, user, today }) => ({
      status: 200,
      body: storeTickets(db, user.storeId).map((ticket) => ticketSummary(db, ticket, today)),
    }),
  },
  // O3
  {
    method: 'GET',
    pattern: /^\/api\/my-store\/tickets\/(?<ticketId>[^/]+)$/,
    role: 'owner',
    handler({ db, user, today }, { ticketId }) {
      const ticket = findById(db.remediationTickets, ticketId)
      if (!ticket || String(ticketStoreId(db, ticket)) !== String(user.storeId)) {
        throw notFound('Ticket not found.')
      }
      return { status: 200, body: ticketDetail(db, ticket, today) }
    },
  },
  // O5
  {
    method: 'GET',
    pattern: /^\/api\/my-store\/inspections$/,
    role: 'owner',
    handler: ({ db, user }) => ({
      status: 200,
      body: storeHistory(db, user.storeId).map((inspection) => inspectionSummary(db, inspection)),
    }),
  },
]
