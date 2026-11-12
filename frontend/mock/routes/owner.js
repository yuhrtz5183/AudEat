import {
  HttpError,
  findById,
  inspectionSummary,
  myStoreResponse,
  notFound,
  nowInstant,
  storeHistory,
  storeTickets,
  submitEvidence,
  ticketDetail,
  ticketStoreId,
  ticketSummary,
} from '../data.js'

const MAX_PHOTOS = 5
const MAX_COMMENT_LENGTH = 1000
// spring.servlet.multipart: max-file-size (every part, text ones too) and max-request-size.
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_REQUEST_BYTES = 26 * 1024 * 1024
// Spring Boot's server.tomcat.max-part-count; Spring reports going over it as an upload too large.
const MAX_PARTS = 50
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** One of the caller's store's tickets; a missing one or another store's is "not found" (O3, O4). */
function ownTicket(db, user, ticketId) {
  const ticket = findById(db.remediationTickets, ticketId)
  if (!ticket || String(ticketStoreId(db, ticket)) !== String(user.storeId)) {
    throw notFound('Ticket not found.')
  }
  return ticket
}

const isFile = (value) => typeof value === 'object' && value !== null && 'size' in value && 'type' in value

const partBytes = (value) => (isFile(value) ? value.size : new TextEncoder().encode(String(value)).length)

/**
 * Spring rejects an oversized part or request, or too many parts, while parsing it, before the
 * controller runs. The request limit counts the parts' contents only; the real one also counts
 * their headers.
 */
function tooLarge(form) {
  const sizes = [...(form?.values() ?? [])].map(partBytes)
  return (
    sizes.length > MAX_PARTS ||
    sizes.some((size) => size > MAX_FILE_BYTES) ||
    sizes.reduce((sum, size) => sum + size, 0) > MAX_REQUEST_BYTES
  )
}

// Java's String.strip(): Character.isWhitespace, which, unlike JS trim(), keeps no-break spaces.
const JAVA_WHITESPACE = String.raw`[\t\n\v\f\r\u001c-\u001f \u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]`
const STRIP = new RegExp(`^${JAVA_WHITESPACE}+|${JAVA_WHITESPACE}+$`, 'g')

/** `@RequestParam String comment`: the text parts named comment, joined by commas if repeated. */
function commentOf(form) {
  const values = (form?.getAll('comment') ?? []).filter((value) => typeof value === 'string')
  // A line break arrives as CRLF; count it as one character, as the backend and maxlength do.
  return values.length === 0 ? '' : values.join(',').replaceAll('\r\n', '\n').replace(STRIP, '')
}

/**
 * O4's field errors, with the backend's messages. handle() is synchronous, so it checks each
 * file's type. On the dev server that type is read from the file's first bytes (vitePlugin.js),
 * as the backend and the evidence form do; unit tests pass files with the type already set.
 */
function evidenceErrors(comment, files) {
  const errors = {}
  if (!comment) errors.comment = 'Describe how you fixed the issue.'
  else if (comment.length > MAX_COMMENT_LENGTH) errors.comment = 'Use 1000 characters or fewer.'
  if (files.length === 0) errors.files = 'Evidence is required.'
  else if (files.length > MAX_PHOTOS) errors.files = 'Upload at most 5 files.'
  else if (!files.every((file) => IMAGE_TYPES.includes(file.type))) {
    errors.files = 'Evidence must be a JPEG, PNG or WebP image.'
  }
  return errors
}

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
      return { status: 200, body: ticketDetail(db, ownTicket(db, user, ticketId), today, { forOwner: true }) }
    },
  },
  // O4 (US 5): multipart `comment` and 1-5 `files`, checked in the backend's order: 413, 404,
  // 409, then the field errors. Nothing is saved unless all of it is valid.
  {
    method: 'POST',
    pattern: /^\/api\/my-store\/tickets\/(?<ticketId>[^/]+)\/submissions$/,
    role: 'owner',
    handler({ db, user, today }, { ticketId }, body) {
      const form = typeof body?.getAll === 'function' ? body : null
      if (tooLarge(form)) throw new HttpError(413, { message: 'Each file must be 5 MB or smaller.' })
      // Only file parts count, and an untouched file input sends an empty one, which does not.
      const files = (form?.getAll('files') ?? []).filter((file) => isFile(file) && file.size > 0)
      const comment = commentOf(form)
      const ticket = ownTicket(db, user, ticketId)
      const status = ticket.status
      submitEvidence(ticket)
      const errors = evidenceErrors(comment, files)
      if (Object.keys(errors).length > 0) {
        // The backend's transaction rolls back.
        ticket.status = status
        return { status: 400, body: { errors } }
      }

      const now = nowInstant()
      const submission = db.insert('remediationSubmissions', {
        ticketId: ticket.id,
        comment,
        submittedAt: now,
        decision: null,
        reviewComment: null,
        reviewedAt: null,
      })
      for (const file of files) {
        db.insert('photos', {
          resultId: null,
          submissionId: submission.id,
          contentType: file.type,
          blob: file,
          createdAt: now,
        })
      }
      return { status: 201, body: ticketDetail(db, ticket, today, { forOwner: true }) }
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
