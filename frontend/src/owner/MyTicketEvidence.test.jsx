import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MOCK_TOKENS, PNG_1x1 } from '../../mock/seed.js'
import { renderApp, requestsTo, signInAs, stubApi } from '../test/renderApp.jsx'

// The seed is relative to today, so pin it to get fixed deadlines (DESIGN §5).
const TODAY = '2026-11-04'
const COMMENT = 'Restocked the sink and added a check to the shift sheet.'

/** The seeded ticket whose required remediation starts with `text`. */
function seededTicket(backend, text) {
  return backend.db.remediationTickets.find((ticket) => ticket.requiredRemediation.startsWith(text))
}

function openTicket(text, { override } = {}) {
  const api = stubApi({ today: TODAY, override })
  const ticket = seededTicket(api.backend, text)
  signInAs('owner')
  const view = renderApp(`/my-store/tickets/${ticket.id}`)
  const submissionsPath = `/api/my-store/tickets/${ticket.id}/submissions`
  return { ...api, ...view, ticket, submissionsPath }
}

const png = (name = 'fix.png') => new File([PNG_1x1], name, { type: 'image/png' })

/** The value next to a term of a details list, e.g. fact(section, 'Status'). */
function fact(container, term) {
  return within(container).getByText(term, { selector: 'dt' }).nextElementSibling
}

const status = () => fact(screen.getByRole('region', { name: 'Remediation' }), 'Status')

async function form() {
  const region = await screen.findByRole('region', { name: 'Send evidence of the fix' })
  return {
    region,
    comment: within(region).getByLabelText('How did you fix the issue?'),
    files: within(region).getByLabelText('Photos of the fix'),
    send: within(region).getByRole('button', { name: 'Send evidence' }),
  }
}

/** Fills the form and sends it; any argument left out stays empty. */
async function sendEvidence(user, { comment, files } = {}) {
  const fields = await form()
  if (comment) await user.type(fields.comment, comment)
  if (files) await user.upload(fields.files, files)
  await user.click(fields.send)
  return fields
}

const json = (status, body) => Response.json(body, { status })

describe('a store owner sends evidence of a fix (US 5)', () => {
  it('AC 5.1: saves the comment and photo, sets the ticket to awaiting review and shows the evidence', async () => {
    const { backend, fetch, user, ticket, submissionsPath } = openTicket('Restock the prep sink')
    const file = png()

    await sendEvidence(user, { comment: COMMENT, files: [file] })

    expect(await screen.findByText('Evidence sent. The inspector will review it.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Evidence sent. The inspector will review it.')

    const [sent] = requestsTo(fetch, submissionsPath)
    expect(requestsTo(fetch, submissionsPath)).toHaveLength(1)
    expect(fetch.mock.calls.find(([url]) => url.endsWith(submissionsPath))[1].method).toBe('POST')
    expect(sent).toBeInstanceOf(FormData)
    expect(sent.get('comment')).toBe(COMMENT)
    expect(sent.getAll('files')).toEqual([file])

    expect(status()).toHaveTextContent(/^Awaiting review$/)
    const evidence = screen.getByRole('region', { name: 'Your evidence' })
    expect(within(evidence).getByText(COMMENT)).toBeInTheDocument()
    expect(fact(evidence, "Inspector's decision")).toHaveTextContent('Waiting for review')
    expect(await within(evidence).findByRole('img', { name: 'Evidence photo 1' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Send evidence of the fix' })).not.toBeInTheDocument()
    // The button that had focus is gone; focus moves to the confirmation.
    expect(screen.getByText('Evidence sent. The inspector will review it.')).toHaveFocus()

    // Saved and associated with the ticket.
    const saved = backend.db.remediationSubmissions.filter((row) => row.ticketId === ticket.id)
    expect(saved).toEqual([
      expect.objectContaining({ comment: COMMENT, decision: null, reviewComment: null, reviewedAt: null }),
    ])
    expect(ticket.status).toBe('awaiting_review')
  })

  it("AC 5.1: makes the submission available in the inspector's review queue", async () => {
    const { fetch, user, ticket } = openTicket('Restock the prep sink')

    await sendEvidence(user, { comment: COMMENT, files: [png()] })
    await screen.findByText('Evidence sent. The inspector will review it.')

    const asInspector = { headers: { Authorization: `Bearer ${MOCK_TOKENS.inspector}` } }
    const queue = await (await fetch('/api/tickets?status=awaiting_review', asInspector)).json()
    expect(queue.map((row) => [row.id, row.issue.comment])).toEqual([
      [ticket.id, 'No paper towels at the prep sink.'],
      [expect.any(Number), 'Cutting boards stained and not sanitized.'],
    ])

    const detail = await (await fetch(`/api/tickets/${ticket.id}`, asInspector)).json()
    expect(detail.status).toBe('awaiting_review')
    const [submission] = detail.submissions
    expect(submission).toMatchObject({ comment: COMMENT, decision: null, evidencePhotoIds: [expect.any(Number)] })

    const photo = await fetch(`/api/photos/${submission.evidencePhotoIds[0]}`, asInspector)
    expect(photo.status).toBe(200)
    expect(photo.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(PNG_1x1)
  })

  it('AC 5.1: sends new evidence for a rejected ticket, up to five photos', async () => {
    const { backend, fetch, user, ticket, submissionsPath } = openTicket('Label and date')
    expect(await screen.findByText(/^Action required:/)).toBeInTheDocument()

    const files = [1, 2, 3, 4, 5].map((n) => png(`label-${n}.png`))
    await sendEvidence(user, { comment: 'Close-ups of every label.', files })

    expect(await screen.findByText('Evidence sent. The inspector will review it.')).toBeInTheDocument()
    expect(requestsTo(fetch, submissionsPath)[0].getAll('files')).toHaveLength(5)
    expect(status()).toHaveTextContent(/^Awaiting review$/)
    expect(screen.queryByText(/^Action required:/)).not.toBeInTheDocument()

    const submissions = [
      ...within(screen.getByRole('region', { name: 'Your evidence' }))
        .getByRole('list', { name: 'Your evidence' }).children,
    ]
    expect(submissions).toHaveLength(2)
    expect(within(submissions[1]).getByText('Close-ups of every label.')).toBeInTheDocument()
    expect(await within(submissions[1]).findByRole('img', { name: 'Evidence photo 5' })).toBeInTheDocument()
    const saved = backend.db.remediationSubmissions.filter((row) => row.ticketId === ticket.id).map((row) => row.id)
    expect(backend.db.photos.filter((row) => saved.includes(row.submissionId))).toHaveLength(1 + 5)
  })

  it('AC 5.2: without evidence nothing is sent and "Evidence is required." is shown', async () => {
    const { backend, fetch, user, ticket, submissionsPath } = openTicket('Restock the prep sink')

    const { files } = await sendEvidence(user, { comment: COMMENT })

    expect(await screen.findByText('Evidence is required.')).toBeInTheDocument()
    expect(files).toHaveAttribute('aria-invalid', 'true')
    expect(files).toHaveAccessibleDescription('Evidence is required.')
    expect(files).toHaveFocus()
    expect(requestsTo(fetch, submissionsPath)).toHaveLength(0)
    expect(status()).toHaveTextContent(/^Open$/)
    expect(ticket.status).toBe('open')
    expect(backend.db.remediationSubmissions.some((row) => row.ticketId === ticket.id)).toBe(false)
    expect(screen.queryByRole('region', { name: 'Your evidence' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('How did you fix the issue?')).toHaveValue(COMMENT)
  })

  it.each([
    ['awaiting review', 'Replace the stained'],
    ['follow-up scheduled', 'Store raw meat'],
    ['approved', 'Seal the gaps'],
  ])('AC 5.1: offers no evidence form on a ticket that is %s', async (_status, text) => {
    openTicket(text)

    expect(await screen.findByRole('region', { name: 'Remediation' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Send evidence of the fix' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send evidence' })).not.toBeInTheDocument()
  })

  it('AC 5.1: offers the form on an open ticket, with labelled fields', async () => {
    openTicket('Repair the cooler')

    const { comment, files, send } = await form()
    expect(comment.tagName).toBe('TEXTAREA')
    // The textarea stops at the backend's limit, so the limit is stated up front.
    expect(comment).toHaveAttribute('maxlength', '1000')
    expect(comment).toHaveAccessibleDescription('Up to 1000 characters.')
    expect(files).toHaveAttribute('type', 'file')
    expect(files).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(files).toHaveAttribute('multiple')
    expect(files).toHaveAccessibleDescription('JPEG, PNG or WebP. Up to 5 photos, 5 MB each.')
    expect(send).toBeEnabled()
  })
})

describe('the evidence form checks everything before sending (AC 5.2)', () => {
  it('AC 5.2: asks for a comment, and focuses the first invalid field', async () => {
    const { fetch, user, submissionsPath } = openTicket('Restock the prep sink')

    const { comment, files } = await sendEvidence(user)

    expect(await screen.findByText('Describe how you fixed the issue.')).toBeInTheDocument()
    expect(comment).toHaveAccessibleDescription('Describe how you fixed the issue.')
    expect(files).toHaveAccessibleDescription('Evidence is required.')
    expect(comment).toHaveFocus()
    expect(requestsTo(fetch, submissionsPath)).toHaveLength(0)
  })

  it('AC 5.2: a blank comment is not a description', async () => {
    const { fetch, user, submissionsPath } = openTicket('Restock the prep sink')

    const { comment } = await sendEvidence(user, { comment: '   ', files: [png()] })

    expect(await screen.findByText('Describe how you fixed the issue.')).toBeInTheDocument()
    expect(comment).toHaveFocus()
    expect(screen.queryByText('Evidence is required.')).not.toBeInTheDocument()
    expect(requestsTo(fetch, submissionsPath)).toHaveLength(0)
  })

  it('AC 5.2: refuses more than five photos', async () => {
    const { fetch, user, submissionsPath } = openTicket('Restock the prep sink')

    const files = [1, 2, 3, 4, 5, 6].map((n) => png(`fix-${n}.png`))
    await sendEvidence(user, { comment: COMMENT, files })

    expect(await screen.findByText('Upload at most 5 files.')).toBeInTheDocument()
    expect(screen.getByLabelText('Photos of the fix')).toHaveFocus()
    expect(requestsTo(fetch, submissionsPath)).toHaveLength(0)
  })

  it('AC 5.2: refuses a file that is not a JPEG, PNG or WebP image, whatever its name says', async () => {
    const { fetch, user, submissionsPath } = openTicket('Restock the prep sink')

    const renamed = new File(['not really a picture'], 'notes.png', { type: 'image/png' })
    await sendEvidence(user, { comment: COMMENT, files: [png(), renamed] })

    expect(await screen.findByText('Evidence must be a JPEG, PNG or WebP image.')).toBeInTheDocument()
    expect(requestsTo(fetch, submissionsPath)).toHaveLength(0)
  })

  it('AC 5.2: refuses a photo over 5 MB', async () => {
    const { fetch, user, submissionsPath } = openTicket('Restock the prep sink')

    const big = new File([PNG_1x1, new Uint8Array(5 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    await sendEvidence(user, { comment: COMMENT, files: [big] })

    expect(await screen.findByText('Each file must be 5 MB or smaller.')).toBeInTheDocument()
    expect(requestsTo(fetch, submissionsPath)).toHaveLength(0)
  })

  it('AC 5.2: clears a field error once the field changes', async () => {
    const { user } = openTicket('Restock the prep sink')

    const { files } = await sendEvidence(user, { comment: COMMENT })
    expect(await screen.findByText('Evidence is required.')).toBeInTheDocument()

    await user.upload(files, png())
    expect(screen.queryByText('Evidence is required.')).not.toBeInTheDocument()
    expect(files).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('the evidence form handles server answers', () => {
  it("AC 5.2: shows the server's field error next to its field", async () => {
    const { user } = openTicket('Restock the prep sink', {
      override: (method, path) =>
        method === 'POST' && path.endsWith('/submissions')
          ? json(400, { errors: { files: 'Evidence must be a JPEG, PNG or WebP image.' } })
          : null,
    })

    const { files } = await sendEvidence(user, { comment: COMMENT, files: [png()] })

    expect(await screen.findByText('Evidence must be a JPEG, PNG or WebP image.')).toBeInTheDocument()
    expect(files).toHaveAccessibleDescription('Evidence must be a JPEG, PNG or WebP image.')
    expect(files).toHaveFocus()
    expect(status()).toHaveTextContent(/^Open$/)
  })

  it('says when the ticket is no longer waiting for evidence, and reloads it', async () => {
    let backend
    const api = openTicket('Restock the prep sink', {
      override: (method, path) => {
        if (method !== 'POST' || !path.endsWith('/submissions')) return null
        // Evidence was sent from another tab in the meantime.
        seededTicket(backend, 'Restock the prep sink').status = 'awaiting_review'
        return json(409, { message: 'This ticket is not waiting for evidence.' })
      },
    })
    backend = api.backend

    await sendEvidence(api.user, { comment: COMMENT, files: [png()] })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This ticket is no longer waiting for evidence.')
    // The disabled button lost focus; the message takes it, and Tab reaches "Reload the ticket".
    await waitFor(() => expect(alert).toHaveFocus())
    await api.user.tab()
    const reload = within(alert).getByRole('button', { name: 'Reload the ticket' })
    expect(reload).toHaveFocus()
    await api.user.keyboard('{Enter}')

    await waitFor(() => expect(status()).toHaveTextContent(/^Awaiting review$/))
    expect(screen.queryByRole('region', { name: 'Send evidence of the fix' })).not.toBeInTheDocument()
    expect(screen.queryByText('Evidence sent. The inspector will review it.')).not.toBeInTheDocument()
    // The reload button is gone with the form; focus goes to the new status, announced.
    const notice = screen.getByText('Ticket reloaded. Its status is Awaiting review.')
    expect(screen.getByRole('status')).toContainElement(notice)
    await waitFor(() => expect(notice).toHaveFocus())
  })

  it('reloads a ticket that still waits for evidence and keeps the form, without the old message', async () => {
    // The backend's optimistic lock: someone else changed the ticket, which still waits.
    const { user } = openTicket('Restock the prep sink', {
      override: (method, path) =>
        method === 'POST' && path.endsWith('/submissions')
          ? json(409, { message: 'This ticket was just updated. Reload and try again.' })
          : null,
    })

    const { comment } = await sendEvidence(user, { comment: COMMENT, files: [png()] })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This ticket was just updated. Reload and try again.')
    await user.click(within(alert).getByRole('button', { name: 'Reload the ticket' }))

    const notice = await screen.findByText('Ticket reloaded. Its status is Open.')
    await waitFor(() => expect(notice).toHaveFocus())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(comment).toHaveValue(COMMENT)
    expect(screen.getByRole('button', { name: 'Send evidence' })).toBeEnabled()
  })

  it.each([
    ['413', () => json(413, { message: 'Each file must be 5 MB or smaller.' }), 'Each file must be 5 MB or smaller.'],
    ['404', () => json(404, { message: 'Ticket not found.' }), 'Ticket not found. It may have been removed.'],
    ['network error', () => Promise.reject(new TypeError('Failed to fetch')), "Couldn't send your evidence. Please try again."],
  ])('shows a %s as a message and keeps what was entered', async (_name, answer, message) => {
    const { user } = openTicket('Restock the prep sink', {
      override: (method, path) => (method === 'POST' && path.endsWith('/submissions') ? answer() : null),
    })

    const { comment } = await sendEvidence(user, { comment: COMMENT, files: [png()] })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    // The button was disabled while sending, which dropped focus; the message takes it.
    await waitFor(() => expect(alert).toHaveFocus())
    await user.tab()
    expect(screen.getByRole('button', { name: 'Send evidence' })).toHaveFocus()
    expect(comment).toHaveValue(COMMENT)
    expect(screen.getByRole('button', { name: 'Send evidence' })).toBeEnabled()
    expect(status()).toHaveTextContent(/^Open$/)
  })

  it('disables the button while the evidence is being sent', async () => {
    let finish
    const { fetch, user, submissionsPath } = openTicket('Restock the prep sink', {
      override: (method, path) =>
        method === 'POST' && path.endsWith('/submissions') ? new Promise((resolve) => { finish = resolve }) : null,
    })

    await sendEvidence(user, { comment: COMMENT, files: [png()] })

    const sending = await screen.findByRole('button', { name: 'Sending…' })
    expect(sending).toBeDisabled()
    expect(sending).toHaveAttribute('aria-busy', 'true')
    await user.click(sending)
    expect(requestsTo(fetch, submissionsPath)).toHaveLength(1)

    // A null override falls through to the mock, which saves the evidence.
    finish(null)
    expect(await screen.findByText('Evidence sent. The inspector will review it.')).toBeInTheDocument()
    expect(status()).toHaveTextContent(/^Awaiting review$/)
  })
})
