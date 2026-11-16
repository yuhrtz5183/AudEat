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
  recordFollowUpResult,
  resultResponse,
  startRegular,
  storeHistory,
  submitInspection,
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
  // US 1: one regular draft per inspector per store. 201 when created, 200 when resumed.
  {
    method: 'POST',
    pattern: /^\/api\/stores\/(?<storeId>[^/]+)\/inspections$/,
    role: 'inspector',
    handler({ db, user, today }, { storeId }) {
      const store = findById(db.stores, storeId)
      if (!store) throw notFound('Store not found.')
      const existing = db.inspections.find(
        (inspection) =>
          String(inspection.storeId) === String(store.id) &&
          inspection.inspectorId === user.id &&
          inspection.status === 'draft' &&
          inspection.followUpOfResultId === null,
      )
      if (existing) return { status: 200, body: inspectionDetail(db, existing, today) }
      const inspection = startRegular(db, store, user, today, nowInstant())
      return { status: 201, body: inspectionDetail(db, inspection, today) }
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/results\/(?<resultId>[^/]+)$/,
    role: 'inspector',
    handler({ db, user, today }, { resultId }, body) {
      const result = findById(db.inspectionResults, resultId)
      if (!result) throw notFound('Result not found.')
      const inspection = inspectionOf(db, result)
      if (inspection.status === 'draft' && !isEditableBy(inspection, user)) {
        throw notFound('Result not found.')
      }
      if (inspection.status !== 'draft') throw conflict('This inspection has already been submitted.')
      const comment = typeof body?.comment === 'string' ? body.comment.trim() : ''
      if (comment.length > 1000) throw new HttpError(400, { errors: { comment: 'Use 1000 characters or fewer.' } })
      result.compliant = body?.compliant === true ? true : body?.compliant === false ? false : null
      result.comment = comment || null
      return { status: 200, body: resultResponse(db, result, today) }
    },
  },
  // AC 2.2: attach an issue photo to a flagged issue
  {
    method: 'POST',
    pattern: /^\/api\/results\/(?<resultId>[^/]+)\/photos$/,
    role: 'inspector',
    handler({ db, user }, { resultId }, body) {
      const result = findById(db.inspectionResults, resultId)
      if (!result) throw notFound('Result not found.')
      const inspection = inspectionOf(db, result)
      if (inspection.status === 'draft' && !isEditableBy(inspection, user)) {
        throw notFound('Result not found.')
      }
      if (inspection.status !== 'draft') throw conflict('This inspection has already been submitted.')
      if (result.compliant !== false) {
        throw conflict('Only a flagged issue can have photos.')
      }
      const form = typeof body?.get === 'function' ? body : null
      const file = form?.get('file')
      const isFile = typeof file === 'object' && file !== null && 'size' in file
      if (!isFile || file.size === 0) {
        throw new HttpError(400, { errors: { file: 'A photo is required.' } })
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new HttpError(413, { message: 'Each file must be 5 MB or smaller.' })
      }
      const existing = db.photos.filter((p) => p.resultId === result.id)
      if (existing.length >= 5) {
        throw new HttpError(400, { errors: { file: 'Upload at most 5 files.' } })
      }
      const validTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!validTypes.includes(file.type)) {
        throw new HttpError(400, { errors: { file: 'Evidence must be a JPEG, PNG or WebP image.' } })
      }
      const photo = db.insert('photos', {
        resultId: result.id,
        submissionId: null,
        contentType: file.type,
        blob: file,
        createdAt: nowInstant(),
      })
      return { status: 201, body: { id: photo.id } }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/inspections\/(?<inspectionId>[^/]+)\/submit$/,
    role: 'inspector',
    handler({ db, user, today }, { inspectionId }) {
      const inspection = findById(db.inspections, inspectionId)
      if (!inspection || (inspection.status === 'draft' && !isEditableBy(inspection, user))) {
        throw notFound('Inspection not found.')
      }
      if (inspection.status !== 'draft') throw conflict('This inspection has already been submitted.')
      const lines = db.inspectionResults.filter((result) => result.inspectionId === inspection.id)
      const errors = {}
      for (const result of lines) {
        if (result.compliant !== true && result.compliant !== false) {
          errors[`results.${result.id}`] = 'Mark this requirement.'
        }
      }
      if (Object.keys(errors).length > 0) throw new HttpError(400, { errors })
      const now = nowInstant()
      submitInspection(inspection, user, today, now)
      if (inspection.followUpOfResultId !== null) {
        const ticket = db.remediationTickets.find((item) => item.resultId === inspection.followUpOfResultId)
        if (!ticket) throw conflict('This ticket is not waiting for a follow-up inspection.')
        recordFollowUpResult(ticket, lines[0].compliant, now)
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
