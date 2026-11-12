import { describe, expect, it } from 'vitest'
import { createMockBackend } from './backend.js'
import {
  approve,
  daysOverdue,
  daysRemaining,
  isEditableBy,
  isOverdue,
  recordFollowUpResult,
  reject,
  review,
  scheduleFollowUp,
  startRegular,
  submitEvidence,
  submitInspection,
} from './data.js'
import { MOCK_TOKENS, MOCK_USERS, PNG_1x1 } from './seed.js'

const TODAY = '2026-11-02'

function setup() {
  const backend = createMockBackend({ today: TODAY })
  const get = (who, url) =>
    backend.handle('GET', url, undefined, who ? { authorization: `Bearer ${MOCK_TOKENS[who]}` } : {})
  return { backend, get }
}

function allTickets(get) {
  return ['open', 'awaiting_review', 'rejected', 'follow_up_scheduled', 'approved']
    .flatMap((status) => get('inspector', `/api/tickets?status=${status}`).body)
}

const byComment = (tickets, start) => tickets.find((ticket) => ticket.issue.comment.startsWith(start))

describe('derived ticket values', () => {
  const ticket = (deadline, status = 'open') => ({ deadline, status })

  it('a deadline of today is not overdue (AC 11.3)', () => {
    expect(isOverdue(ticket(TODAY), TODAY)).toBe(false)
    expect(daysRemaining(ticket(TODAY), TODAY)).toBe(0)
    expect(daysOverdue(ticket(TODAY), TODAY)).toBe(0)
  })

  it('a deadline before today is overdue', () => {
    expect(isOverdue(ticket('2026-11-01'), TODAY)).toBe(true)
    expect(daysRemaining(ticket('2026-10-31'), TODAY)).toBe(-2)
    expect(daysOverdue(ticket('2026-10-31'), TODAY)).toBe(2)
  })

  it('an approved ticket is never overdue (AC 11.2)', () => {
    expect(isOverdue(ticket('2026-09-01', 'approved'), TODAY)).toBe(false)
    expect(daysOverdue(ticket('2026-09-01', 'approved'), TODAY)).toBe(0)
  })
})

describe('transitions', () => {
  it('moves a ticket through evidence, rejection and approval', () => {
    const ticket = { status: 'open', approvedAt: null }
    submitEvidence(ticket)
    expect(ticket.status).toBe('awaiting_review')
    reject(ticket)
    expect(ticket.status).toBe('rejected')
    submitEvidence(ticket)
    approve(ticket, '2026-11-02T15:00:00Z')
    expect(ticket).toEqual({ status: 'approved', approvedAt: '2026-11-02T15:00:00Z' })
    expect(() => submitEvidence(ticket)).toThrow('This ticket is not waiting for evidence.')
  })

  it('refuses approve and reject on a follow_up_scheduled ticket', () => {
    const ticket = { status: 'follow_up_scheduled', approvedAt: null }
    const refused = 'This ticket has no evidence waiting for review.'
    expect(() => approve(ticket, 'now')).toThrow(refused)
    expect(() => reject(ticket)).toThrow(refused)
    expect(() => scheduleFollowUp(ticket)).toThrow(refused)
    recordFollowUpResult(ticket, false, 'now')
    expect(ticket.status).toBe('rejected')
  })

  it('refuses recordFollowUpResult on an awaiting_review ticket', () => {
    const ticket = { status: 'awaiting_review', approvedAt: null }
    expect(() => recordFollowUpResult(ticket, true, 'now')).toThrow(
      'This ticket is not waiting for a follow-up inspection.',
    )
    scheduleFollowUp(ticket)
    recordFollowUpResult(ticket, true, 'now')
    expect(ticket).toEqual({ status: 'approved', approvedAt: 'now' })
  })

  it('reviews a submission only once', () => {
    const submission = { decision: null, reviewComment: null, reviewedAt: null }
    review(submission, 'rejected', 'Blurry photo.', 'now')
    expect(submission).toEqual({ decision: 'rejected', reviewComment: 'Blurry photo.', reviewedAt: 'now' })
    expect(() => review(submission, 'approved', null, 'now')).toThrow('This submission has already been reviewed.')
  })

  it('submits a follow-up as the caller, re-dated to today, and refuses a second submit', () => {
    const followUp = { status: 'draft', followUpOfResultId: 9, inspectorId: 1, inspectionDate: '2026-11-04' }
    expect(isEditableBy(followUp, { id: 2 })).toBe(true)
    submitInspection(followUp, { id: 2 }, TODAY, 'now')
    expect(followUp).toEqual({
      status: 'submitted',
      followUpOfResultId: 9,
      inspectorId: 2,
      inspectionDate: TODAY,
      submittedAt: 'now',
    })
    expect(() => submitInspection(followUp, { id: 2 }, TODAY, 'now')).toThrow(
      'This inspection has already been submitted.',
    )
  })

  it('keeps the inspector of a regular inspection and lets only them edit its draft', () => {
    const draft = { status: 'draft', followUpOfResultId: null, inspectorId: 1, inspectionDate: '2026-11-01' }
    expect(isEditableBy(draft, { id: 1 })).toBe(true)
    expect(isEditableBy(draft, { id: 2 })).toBe(false)
    submitInspection(draft, { id: 2 }, TODAY, 'now')
    expect(draft).toMatchObject({ inspectorId: 1, inspectionDate: '2026-11-01' })
  })
})

describe('seeded owner data (DESIGN §5)', () => {
  it('O1: counts open and rejected tickets', () => {
    const { get } = setup()
    expect(get('owner', '/api/my-store')).toEqual({
      status: 200,
      body: { id: 1, name: 'Blue Plate Diner', address: '412 Main St', openTicketCount: 5, rejectedCount: 1 },
    })
    expect(get('otherOwner', '/api/my-store').body).toMatchObject({ openTicketCount: 1, rejectedCount: 0 })
  })

  it('O2: lists tickets A, B, E, C, F, then the approved D', () => {
    const { get } = setup()
    const tickets = get('owner', '/api/my-store/tickets').body
    expect(tickets.map((ticket) => [ticket.issue.comment, ticket.status, ticket.deadline])).toEqual([
      ['Walk-in cooler read 48°F.', 'open', '2026-10-31'],
      ['No paper towels at the prep sink.', 'open', '2026-11-02'],
      ['Unlabeled containers in the walk-in.', 'rejected', '2026-11-05'],
      ['Cutting boards stained and not sanitized.', 'awaiting_review', '2026-11-07'],
      ['Raw chicken stored above salad greens.', 'follow_up_scheduled', '2026-11-09'],
      ['Mouse droppings behind the dry-storage shelf.', 'approved', '2026-09-23'],
    ])
  })

  it('only ticket A is overdue, and ticket F links to the I4 follow-up draft', () => {
    const { get } = setup()
    const tickets = allTickets(get)
    expect(tickets).toHaveLength(8)
    expect(tickets.filter((ticket) => ticket.overdue).map((ticket) => ticket.issue.comment)).toEqual([
      'Walk-in cooler read 48°F.',
    ])
    expect(byComment(tickets, 'Walk-in')).toMatchObject({ daysRemaining: -2, daysOverdue: 2 })
    expect(byComment(tickets, 'No paper towels')).toMatchObject({ overdue: false, daysRemaining: 0, daysOverdue: 0 })

    const f = byComment(tickets, 'Raw chicken')
    expect(f.followUpDate).toBe('2026-11-04')
    const followUp = get('inspector', `/api/inspections/${f.followUpInspectionId}`).body
    expect(followUp).toMatchObject({
      inspectionDate: '2026-11-04',
      status: 'draft',
      followUpOfTicketId: f.id,
      violationCount: 0,
    })
    expect(followUp.results).toHaveLength(1)
    expect(followUp.results[0]).toMatchObject({ requirementId: 2, compliant: null, resolved: null, ticket: null })
    expect(tickets.filter((ticket) => ticket.followUpInspectionId !== null)).toEqual([f])
  })

  it('O3: returns the §4 ticket detail, with the rejecting review comment', () => {
    const { get } = setup()
    const e = byComment(get('owner', '/api/my-store/tickets').body, 'Unlabeled')
    const detail = get('owner', `/api/my-store/tickets/${e.id}`).body
    expect(detail).toEqual({
      ...e,
      issue: { ...e.issue, photoIds: [] },
      createdAt: '2026-10-23T15:00:00Z',
      approvedAt: null,
      submissions: [
        {
          id: expect.any(Number),
          comment: 'Labeled every container in the walk-in.',
          submittedAt: '2026-10-29T15:00:00Z',
          evidencePhotoIds: [expect.any(Number)],
          decision: 'rejected',
          reviewComment: 'The photo does not show the labels; please send a close-up.',
          reviewedAt: '2026-10-30T15:00:00Z',
        },
      ],
      followUps: [],
    })
    expect(e).toEqual({
      id: expect.any(Number),
      status: 'rejected',
      overdue: false,
      deadline: '2026-11-05',
      daysRemaining: 3,
      daysOverdue: 0,
      requiredRemediation: 'Label and date every container in the walk-in.',
      issue: {
        resultId: expect.any(Number),
        requirement: 'Stored food is labeled and within its use-by date.',
        comment: 'Unlabeled containers in the walk-in.',
        resolved: false,
      },
      storeId: 1,
      storeName: 'Blue Plate Diner',
      inspectionId: expect.any(Number),
      inspectionDate: '2026-10-23',
      followUpDate: null,
      followUpInspectionId: null,
    })
  })

  it('shows ticket H as approved through its submitted follow-up', () => {
    const { get } = setup()
    const h = byComment(allTickets(get), 'Fruit flies')
    expect(get('inspector', `/api/tickets/${h.id}`).body).toMatchObject({
      status: 'approved',
      issue: { resolved: true },
      approvedAt: '2026-10-03T15:00:00Z',
      followUpDate: null,
      submissions: [{ decision: 'follow_up', reviewComment: null }],
      followUps: [
        {
          inspectionDate: '2026-10-03',
          status: 'submitted',
          compliant: true,
          comment: 'No flies seen; drain cleaned.',
        },
      ],
    })
  })
})

describe('history (AC 8.1, 9.1)', () => {
  const summary = ({ inspectionDate, inspectorName, violationCount, followUp }) =>
    [inspectionDate, inspectorName, violationCount, followUp]

  it('lists submitted inspections newest first with violation counts', () => {
    const { get } = setup()
    expect(get('owner', '/api/my-store/inspections').body.map(summary)).toEqual([
      ['2026-10-23', 'Ivy Inspector', 6, false],
      ['2026-10-03', 'Ivy Inspector', 0, false],
      ['2026-09-03', 'Ivy Inspector', 1, false],
    ])
    expect(get('inspector', '/api/stores/3/inspections').body.map(summary)).toEqual([
      ['2026-10-28', 'Ivy Inspector', 1, false],
      ['2026-10-03', 'Ivy Inspector', 0, true],
      ['2026-09-23', 'Ivy Inspector', 1, false],
    ])
    expect(get('inspector', '/api/stores/2/inspections')).toEqual({ status: 200, body: [] })
    expect(get('inspector', '/api/stores/99/inspections')).toEqual({
      status: 404,
      body: { message: 'Store not found.' },
    })
  })

  it('I2: shows every checklist result of a submitted inspection, with photos and tickets (AC 8.2)', () => {
    const { get } = setup()
    const [latest] = get('inspector', '/api/stores/1/inspections').body
    const detail = get('inspector', `/api/inspections/${latest.id}`).body
    expect(detail).toMatchObject({
      id: latest.id,
      storeId: 1,
      storeName: 'Blue Plate Diner',
      inspectorName: 'Ivy Inspector',
      inspectionDate: '2026-10-23',
      status: 'submitted',
      submittedAt: '2026-10-23T15:00:00Z',
      followUpOfTicketId: null,
      violationCount: 6,
    })
    expect(detail.results.map((result) => [result.requirementId, result.compliant, result.ticket?.status ?? null]))
      .toEqual([
        [1, false, 'open'],
        [2, false, 'follow_up_scheduled'],
        [3, false, 'open'],
        [4, false, null],
        [5, false, 'awaiting_review'],
        [6, true, null],
        [7, false, 'rejected'],
        [8, true, null],
      ])
    expect(detail.results[0]).toEqual({
      id: expect.any(Number),
      requirementId: 1,
      requirement: 'Cold food is held at 41°F (5°C) or below and hot food at 135°F (57°C) or above.',
      compliant: false,
      comment: 'Walk-in cooler read 48°F.',
      photoIds: [expect.any(Number)],
      resolved: false,
      ticket: {
        id: expect.any(Number),
        status: 'open',
        overdue: true,
        deadline: '2026-10-31',
        daysRemaining: -2,
        daysOverdue: 2,
        requiredRemediation: 'Repair the cooler and log temperatures twice daily.',
      },
    })
    expect(detail.results[5]).toMatchObject({ compliant: true, comment: null, photoIds: [], resolved: null })
  })

  it("I2: hides another inspector's regular draft", () => {
    const { backend, get } = setup()
    backend.handle('POST', '/api/auth/register', {
      name: 'Ada Inspector',
      email: 'ada@example.com',
      password: 'correct-horse',
      role: 'inspector',
    })
    const { token, user } = backend.handle('POST', '/api/auth/login', {
      email: 'ada@example.com',
      password: 'correct-horse',
    }).body
    const draft = startRegular(backend.db, backend.db.stores[0], user, TODAY, 'now')
    const url = `/api/inspections/${draft.id}`

    expect(backend.handle('GET', url, undefined, { authorization: `Bearer ${token}` }).body).toMatchObject({
      status: 'draft',
      results: expect.arrayContaining([expect.objectContaining({ compliant: null })]),
    })
    expect(get('inspector', url)).toEqual({ status: 404, body: { message: 'Inspection not found.' } })
  })
})

describe('I8 ticket queues', () => {
  it('lists awaiting_review and follow_up_scheduled tickets across stores', () => {
    const { get } = setup()
    expect(get('inspector', '/api/tickets?status=awaiting_review').body.map((ticket) => ticket.issue.comment))
      .toEqual(['Cutting boards stained and not sanitized.'])
    expect(get('inspector', '/api/tickets?status=open').body.map((ticket) => ticket.storeName)).toEqual([
      'Blue Plate Diner',
      'Blue Plate Diner',
      'Corner Bakery Co.',
    ])
  })

  it('returns 400 without a status or with an unknown one', () => {
    const { get } = setup()
    const unknown = { status: 400, body: { message: 'Unknown ticket status.' } }
    expect(get('inspector', '/api/tickets')).toEqual(unknown)
    expect(get('inspector', '/api/tickets?status=overdue')).toEqual(unknown)
    expect(get('inspector', '/api/tickets?status=AWAITING_REVIEW')).toEqual(unknown)
  })
})

describe('authorization (AC 9.2, 15.2)', () => {
  const forbidden = { status: 403, body: { message: 'You are not authorized to view this page.' } }

  it("gives an owner 404 for another store's ticket and 403 for another store's history", () => {
    const { get } = setup()
    const corner = get('otherOwner', '/api/my-store/tickets').body
    expect(corner).toHaveLength(2)
    for (const ticket of corner) {
      expect(get('owner', `/api/my-store/tickets/${ticket.id}`)).toEqual({
        status: 404,
        body: { message: 'Ticket not found.' },
      })
    }
    expect(get('owner', '/api/my-store/tickets/999')).toEqual({ status: 404, body: { message: 'Ticket not found.' } })
    expect(get('owner', '/api/stores/3/inspections')).toEqual(forbidden)
    expect(get('owner', `/api/tickets/${corner[0].id}`)).toEqual(forbidden)
  })

  it('gives an inspector 403 on owner routes', () => {
    const { get } = setup()
    expect(get('inspector', '/api/my-store')).toEqual(forbidden)
  })

  it('needs a known bearer token on protected routes', () => {
    const { backend, get } = setup()
    const required = { status: 401, body: { message: 'Authentication required.' } }
    expect(get(null, '/api/my-store')).toEqual(required)
    expect(backend.handle('GET', '/api/my-store', undefined, { authorization: 'Bearer nope' })).toEqual(required)
    expect(get(null, '/api/stores').status).toBe(200)
    expect(get('owner', '/api/nothing-here')).toEqual({ status: 404, body: { message: 'Not found.' } })
  })

  it('signs a demo account in with a session the protected routes accept', () => {
    const { backend } = setup()
    const login = backend.handle('POST', '/api/auth/login', {
      email: 'OWNER.CORNER@audeat.test',
      password: 'audeat-demo',
    })
    expect(login.body.user).toEqual(MOCK_USERS.otherOwner)
    expect(login.body.user.storeId).toBe(3) // a number, as the backend sends it
    const authorization = `Bearer ${login.body.token}`
    expect(backend.handle('GET', '/api/my-store', undefined, { authorization }).body.name).toBe('Corner Bakery Co.')
  })
})

describe('S1 photos', () => {
  it('serves an inspector any photo and an owner only their own store’s', async () => {
    const { get } = setup()
    const blue = get('owner', '/api/my-store/tickets').body
    const issuePhoto = get('owner', `/api/my-store/tickets/${blue[0].id}`).body.issue.photoIds[0]

    const photo = get('inspector', `/api/photos/${issuePhoto}`)
    expect(photo.status).toBe(200)
    expect(photo.blob.type).toBe('image/png')
    expect(new Uint8Array(await photo.blob.arrayBuffer()).slice(1, 4)).toEqual(new Uint8Array([80, 78, 71]))
    expect(get('owner', `/api/photos/${issuePhoto}`).status).toBe(200)
    expect(get('otherOwner', `/api/photos/${issuePhoto}`)).toEqual({
      status: 404,
      body: { message: 'Photo not found.' },
    })
    expect(get('owner', '/api/photos/999').status).toBe(404)
    expect(get(null, `/api/photos/${issuePhoto}`).status).toBe(401)
  })

  it("hides a draft inspection's photo from its store owner", () => {
    const { backend, get } = setup()
    const followUp = backend.db.inspections.find((inspection) => inspection.status === 'draft')
    const result = backend.db.inspectionResults.find((row) => row.inspectionId === followUp.id)
    const photo = backend.db.insert('photos', {
      resultId: result.id,
      submissionId: null,
      contentType: 'image/png',
      blob: new Blob(['x'], { type: 'image/png' }),
      createdAt: 'now',
    })
    expect(get('inspector', `/api/photos/${photo.id}`).status).toBe(200)
    expect(get('owner', `/api/photos/${photo.id}`).status).toBe(404)
  })

  it("hides a draft follow-up's unsubmitted result from the store owner, but not its date", () => {
    const { backend, get } = setup()
    const scheduled = get('owner', '/api/my-store/tickets').body.find(
      (ticket) => ticket.status === 'follow_up_scheduled',
    )
    const result = backend.db.inspectionResults.find(
      (row) => row.inspectionId === scheduled.followUpInspectionId,
    )
    Object.assign(result, { compliant: false, comment: 'Shelving still not installed.' })

    const draft = {
      inspectionId: scheduled.followUpInspectionId,
      inspectionDate: scheduled.followUpDate,
      status: 'draft',
    }
    expect(get('owner', `/api/my-store/tickets/${scheduled.id}`).body.followUps).toEqual([
      { ...draft, compliant: null, comment: null },
    ])
    expect(get('inspector', `/api/tickets/${scheduled.id}`).body.followUps).toEqual([
      { ...draft, compliant: false, comment: 'Shelving still not installed.' },
    ])
  })
})

describe('O4 evidence (US 5)', () => {
  const png = (name = 'fix.png') => new File([PNG_1x1], name, { type: 'image/png' })

  function evidence(comment, files) {
    const form = new FormData()
    if (comment !== undefined) form.append('comment', comment)
    for (const file of files) form.append('files', file)
    return form
  }

  function setupO4() {
    const { backend, get } = setup()
    const post = (who, ticketId, body) =>
      backend.handle('POST', `/api/my-store/tickets/${ticketId}/submissions`, body, {
        authorization: `Bearer ${MOCK_TOKENS[who]}`,
      })
    const ticket = (start) => byComment(get('owner', '/api/my-store/tickets').body, start)
    const saved = () => [backend.db.remediationSubmissions.length, backend.db.photos.length]
    return { backend, get, post, ticket, saved }
  }

  it('AC 5.1: saves the submission and its photos, and the ticket awaits review', async () => {
    const { get, post, ticket } = setupO4()
    const b = ticket('No paper towels')

    const response = post('owner', b.id, evidence('  Restocked the sink.  ', [png('a.png'), png('b.png')]))

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ id: b.id, status: 'awaiting_review', approvedAt: null })
    expect(response.body.submissions).toEqual([
      {
        id: expect.any(Number),
        comment: 'Restocked the sink.',
        submittedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
        evidencePhotoIds: [expect.any(Number), expect.any(Number)],
        decision: null,
        reviewComment: null,
        reviewedAt: null,
      },
    ])
    expect(get('owner', `/api/my-store/tickets/${b.id}`).body).toEqual(response.body)

    // Available to the inspector: in the review queue, in the ticket and as a photo.
    expect(get('inspector', '/api/tickets?status=awaiting_review').body.map((row) => row.issue.comment)).toEqual([
      'No paper towels at the prep sink.',
      'Cutting boards stained and not sanitized.',
    ])
    expect(get('inspector', `/api/tickets/${b.id}`).body.submissions).toEqual(response.body.submissions)
    const photo = get('inspector', `/api/photos/${response.body.submissions[0].evidencePhotoIds[0]}`)
    expect(photo.status).toBe(200)
    expect(photo.blob.type).toBe('image/png')
    expect(new Uint8Array(await photo.blob.arrayBuffer())).toEqual(PNG_1x1)
    expect(get('owner', `/api/photos/${response.body.submissions[0].evidencePhotoIds[1]}`).status).toBe(200)
    expect(get('otherOwner', `/api/photos/${response.body.submissions[0].evidencePhotoIds[0]}`).status).toBe(404)
  })

  it('AC 5.1: accepts new evidence for a rejected ticket, after the earlier submission', () => {
    const { get, post, ticket } = setupO4()
    const e = ticket('Unlabeled')

    const response = post('owner', e.id, evidence('Close-ups of the labels.', [png()]))

    expect(response.status).toBe(201)
    expect(response.body.status).toBe('awaiting_review')
    expect(response.body.submissions.map((row) => [row.comment, row.decision])).toEqual([
      ['Labeled every container in the walk-in.', 'rejected'],
      ['Close-ups of the labels.', null],
    ])
    expect(get('owner', '/api/my-store').body.rejectedCount).toBe(0)
  })

  it('AC 5.2: refuses a submission without evidence and saves nothing', () => {
    const { post, ticket, saved } = setupO4()
    const b = ticket('No paper towels')
    const before = saved()

    expect(post('owner', b.id, evidence('Restocked the sink.', []))).toEqual({
      status: 400,
      body: { errors: { files: 'Evidence is required.' } },
    })
    // An untouched file input sends one empty part, which does not count.
    expect(post('owner', b.id, evidence('Restocked the sink.', [new File([], '')]))).toEqual({
      status: 400,
      body: { errors: { files: 'Evidence is required.' } },
    })
    expect(post('owner', b.id, {})).toEqual({
      status: 400,
      body: { errors: { comment: 'Describe how you fixed the issue.', files: 'Evidence is required.' } },
    })
    expect(saved()).toEqual(before)
    expect(ticket('No paper towels').status).toBe('open')
  })

  it('AC 5.2: checks the comment, the number of files and their type', () => {
    const { post, ticket, saved } = setupO4()
    const b = ticket('No paper towels')
    const before = saved()
    const errors = (body) => post('owner', b.id, body)

    expect(errors(evidence('   ', [png()]))).toEqual({
      status: 400,
      body: { errors: { comment: 'Describe how you fixed the issue.' } },
    })
    expect(errors(evidence('x'.repeat(1001), [png()])).body).toEqual({
      errors: { comment: 'Use 1000 characters or fewer.' },
    })
    expect(errors(evidence('Fixed.', [1, 2, 3, 4, 5, 6].map(() => png()))).body).toEqual({
      errors: { files: 'Upload at most 5 files.' },
    })
    const gif = new File(['GIF89a'], 'fix.gif', { type: 'image/gif' })
    expect(errors(evidence('Fixed.', [png(), gif])).body).toEqual({
      errors: { files: 'Evidence must be a JPEG, PNG or WebP image.' },
    })
    // A text part named files is not a file: Spring binds no files at all.
    expect(errors(evidence('Fixed.', ['not a file'])).body).toEqual({
      errors: { files: 'Evidence is required.' },
    })
    expect(saved()).toEqual(before)
    expect(ticket('No paper towels').status).toBe('open')
  })

  it('returns 413 for a file over 5 MB, before anything else', () => {
    const { post, ticket, saved } = setupO4()
    const before = saved()
    const big = new File([PNG_1x1, new Uint8Array(5 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    const tooLarge = { status: 413, body: { message: 'Each file must be 5 MB or smaller.' } }

    expect(post('owner', ticket('No paper towels').id, evidence('Fixed.', [big]))).toEqual(tooLarge)
    expect(post('owner', 999, evidence('', [big]))).toEqual(tooLarge)
    expect(saved()).toEqual(before)
  })

  it('returns 413 for a request over 26 MB, a text part over 5 MB or more than 50 parts', () => {
    const { post, ticket, saved } = setupO4()
    const b = ticket('No paper towels').id
    const before = saved()
    const tooLarge = { status: 413, body: { message: 'Each file must be 5 MB or smaller.' } }
    const almost5MB = () => new File([PNG_1x1, new Uint8Array(4.5 * 1024 * 1024)], 'fix.png', { type: 'image/png' })

    expect(post('owner', b, evidence('Fixed.', [1, 2, 3, 4, 5, 6].map(almost5MB)))).toEqual(tooLarge)
    expect(post('owner', b, evidence('x'.repeat(5 * 1024 * 1024 + 1), [png()]))).toEqual(tooLarge)
    // The comment and 49 files are 50 parts: too many files, but parsed.
    expect(post('owner', b, evidence('Fixed.', Array.from({ length: 49 }, () => png()))).body).toEqual({
      errors: { files: 'Upload at most 5 files.' },
    })
    expect(post('owner', b, evidence('Fixed.', Array.from({ length: 50 }, () => png())))).toEqual(tooLarge)
    expect(saved()).toEqual(before)
    expect(ticket('No paper towels').status).toBe('open')
  })

  it("reads the comment as Spring binds it: Java's strip(), repeated parts joined by commas", () => {
    const { post, ticket } = setupO4()
    const b = ticket('No paper towels').id
    const gif = new File(['GIF89a'], 'fix.gif', { type: 'image/gif' })
    const errors = (comment) => {
      const form = evidence(undefined, [gif])
      for (const part of [comment].flat()) form.append('comment', part)
      return post('owner', b, form).body.errors
    }

    // Java's strip() removes control separators but keeps a no-break space.
    expect(errors('\u001f\t ').comment).toBe('Describe how you fixed the issue.')
    expect(errors('\u00a0').comment).toBeUndefined()
    expect(errors(['x'.repeat(500), 'x'.repeat(500)]).comment).toBe('Use 1000 characters or fewer.')
    expect(errors('x'.repeat(1000)).comment).toBeUndefined()
    // A textarea line break arrives as CRLF but counts as one character, as in the form.
    expect(errors(`${'x'.repeat(499)}\r\n${'x'.repeat(500)}`).comment).toBeUndefined()

    const response = post('owner', b, evidence('\u00a0Fixed. ', [png()]))
    expect(response.status).toBe(201)
    expect(response.body.submissions[0].comment).toBe('\u00a0Fixed.')
  })

  it("returns 404 for a missing ticket or another store's", () => {
    const { get, post, saved } = setupO4()
    const before = saved()
    const notFoundBody = { status: 404, body: { message: 'Ticket not found.' } }
    const g = byComment(get('otherOwner', '/api/my-store/tickets').body, 'Dumpster')

    expect(post('owner', g.id, evidence('Fixed.', [png()]))).toEqual(notFoundBody)
    expect(post('owner', 999, evidence('Fixed.', [png()]))).toEqual(notFoundBody)
    expect(saved()).toEqual(before)
    expect(get('otherOwner', `/api/my-store/tickets/${g.id}`).body.status).toBe('open')
  })

  it('returns 409, before the field errors, when the ticket is not waiting for evidence', () => {
    const { post, ticket, saved } = setupO4()
    const before = saved()
    const refused = { status: 409, body: { message: 'This ticket is not waiting for evidence.' } }

    for (const start of ['Cutting boards', 'Raw chicken', 'Mouse droppings']) {
      const row = ticket(start)
      expect(post('owner', row.id, evidence('Fixed.', [png()]))).toEqual(refused)
      expect(post('owner', row.id, evidence('', []))).toEqual(refused)
      expect(ticket(start).status).toBe(row.status)
    }
    expect(saved()).toEqual(before)
  })

  it('accepts a second submission only after a review, and only for owners', () => {
    const { get, post, ticket } = setupO4()
    const b = ticket('No paper towels')

    expect(post('owner', b.id, evidence('Fixed.', [png()])).status).toBe(201)
    expect(post('owner', b.id, evidence('Fixed again.', [png()])).status).toBe(409)
    expect(post('inspector', b.id, evidence('Fixed.', [png()]))).toEqual({
      status: 403,
      body: { message: 'You are not authorized to view this page.' },
    })
    expect(get('owner', `/api/my-store/tickets/${b.id}`).body.submissions).toHaveLength(1)
  })
})
