import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, requestsTo, signInAs, stubApi } from '../test/renderApp.jsx'

// The seed is relative to today, so pin it to get fixed deadlines (DESIGN §5).
const TODAY = '2026-11-04'
const COOLER = 'Cold food is held at 41°F (5°C) or below and hot food at 135°F (57°C) or above.'

/** The seeded ticket whose required remediation starts with `text`. */
function seededTicket(backend, text) {
  return backend.db.remediationTickets.find((ticket) => ticket.requiredRemediation.startsWith(text))
}

function openTicket(text, { override } = {}) {
  const api = stubApi({ today: TODAY, override })
  const ticket = seededTicket(api.backend, text)
  signInAs('owner')
  const view = renderApp(`/my-store/tickets/${ticket.id}`)
  return { ...api, ...view, ticket }
}

/** The value next to a term of a details list, e.g. fact(section, 'Deadline'). */
function fact(container, term) {
  return within(container).getByText(term, { selector: 'dt' }).nextElementSibling
}

describe("a store owner sees one remediation ticket's details (AC 4.2)", () => {
  it('AC 4.2: shows the issue, the inspector\'s comment, the issue photo and the status', async () => {
    const { backend, fetch, ticket } = openTicket('Repair the cooler')

    expect(await screen.findByText(COOLER)).toBeInTheDocument()
    const issue = screen.getByRole('region', { name: 'Flagged issue' })
    expect(fact(issue, 'Found on')).toHaveTextContent('Oct 25, 2026')
    expect(fact(issue, "Inspector's comment")).toHaveTextContent('Walk-in cooler read 48°F.')

    const photo = backend.db.photos.find((row) => row.resultId === ticket.resultId)
    expect(await within(issue).findByRole('img', { name: 'Issue photo 1' })).toBeInTheDocument()
    expect(requestsTo(fetch, `/api/photos/${photo.id}`)).toHaveLength(1)

    const remediation = screen.getByRole('region', { name: 'Remediation' })
    expect(fact(remediation, 'Status')).toHaveTextContent('Overdue · Open')
    expect(fact(remediation, 'Deadline')).toHaveTextContent('Nov 2, 2026')
    expect(fact(remediation, 'Deadline')).toHaveTextContent('2 days overdue')
    expect(fact(remediation, 'Required remediation')).toHaveTextContent(
      'Repair the cooler and log temperatures twice daily.',
    )
    expect(screen.queryByText(/Action required/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your evidence' })).not.toBeInTheDocument()
  })

  it('AC 4.2: shows every photo of the issue, and only the issue photos', async () => {
    const api = stubApi({ today: TODAY })
    const ticket = seededTicket(api.backend, 'Repair the cooler')
    const seeded = api.backend.db.photos.find((row) => row.resultId === ticket.resultId)
    const extra = [1, 2].map(() =>
      api.backend.db.insert('photos', { ...seeded, id: undefined }),
    )
    signInAs('owner')
    renderApp(`/my-store/tickets/${ticket.id}`)

    const issue = await screen.findByRole('region', { name: 'Flagged issue' })
    await within(issue).findByRole('img', { name: 'Issue photo 3' })
    expect(within(issue).getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual([
      'Issue photo 1',
      'Issue photo 2',
      'Issue photo 3',
    ])
    for (const id of [seeded.id, ...extra.map((row) => row.id)]) {
      expect(requestsTo(api.fetch, `/api/photos/${id}`)).toHaveLength(1)
    }
    expect(screen.getAllByRole('img')).toHaveLength(3)
  })

  it('AC 4.2: says when the issue has no photos', async () => {
    openTicket('Restock the prep sink')

    expect(await screen.findByText('No photos were taken of this issue.')).toBeInTheDocument()
    const remediation = screen.getByRole('region', { name: 'Remediation' })
    expect(fact(remediation, 'Status')).toHaveTextContent(/^Open$/)
    expect(fact(remediation, 'Deadline')).toHaveTextContent('Due today')
  })

  it("AC 4.2 + 6.2: shows a rejected ticket's review comment as the action required", async () => {
    openTicket('Label and date')

    const reason = 'The photo does not show the labels; please send a close-up.'
    expect(await screen.findByText(`Action required: ${reason}`)).toBeInTheDocument()
    const remediation = screen.getByRole('region', { name: 'Remediation' })
    expect(fact(remediation, 'Status')).toHaveTextContent('Rejected')
    expect(fact(remediation, 'Deadline')).toHaveTextContent('3 days left')

    const evidence = screen.getByRole('region', { name: 'Your evidence' })
    expect(within(evidence).getByText('Labeled every container in the walk-in.')).toBeInTheDocument()
    expect(fact(evidence, "Inspector's decision")).toHaveTextContent('Rejected')
    expect(fact(evidence, "Inspector's comment")).toHaveTextContent(reason)
    expect(await within(evidence).findByRole('img', { name: 'Evidence photo 1' })).toBeInTheDocument()
  })

  it("AC 4.2: shows the inspector's review comment of every submission, oldest first", async () => {
    const api = stubApi({ today: TODAY })
    const ticket = seededTicket(api.backend, 'Label and date')
    const first = api.backend.db.remediationSubmissions.find((row) => row.ticketId === ticket.id)
    const later = (instant) => new Date(Date.parse(instant) + 60 * 60 * 1000).toISOString()
    api.backend.db.insert('remediationSubmissions', {
      ticketId: ticket.id,
      comment: 'Sent a close-up of the labels.',
      submittedAt: later(first.reviewedAt),
      decision: 'rejected',
      reviewComment: 'Two containers still have no date.',
      reviewedAt: later(later(first.reviewedAt)),
    })
    signInAs('owner')
    renderApp(`/my-store/tickets/${ticket.id}`)

    const evidence = await screen.findByRole('region', { name: 'Your evidence' })
    // The list's own items; each one also holds a list of its evidence photos.
    const submissions = [...within(evidence).getByRole('list', { name: 'Your evidence' }).children]
    expect(submissions).toHaveLength(2)
    expect(fact(submissions[0], "Inspector's comment")).toHaveTextContent(
      'The photo does not show the labels; please send a close-up.',
    )
    expect(fact(submissions[1], "Inspector's comment")).toHaveTextContent(
      'Two containers still have no date.',
    )
    expect(within(submissions[1]).getByText('Sent a close-up of the labels.')).toBeInTheDocument()
    // The latest review is the action required now.
    expect(
      screen.getByText('Action required: Two containers still have no date.'),
    ).toBeInTheDocument()
  })

  it('AC 4.2 + 7.1: shows the scheduled follow-up date and the review comment', async () => {
    openTicket('Store raw meat')

    const remediation = await screen.findByRole('region', { name: 'Remediation' })
    expect(fact(remediation, 'Status')).toHaveTextContent('Follow-up scheduled')
    expect(fact(remediation, 'Follow-up inspection')).toHaveTextContent('Nov 6, 2026')
    const evidence = screen.getByRole('region', { name: 'Your evidence' })
    expect(fact(evidence, "Inspector's decision")).toHaveTextContent('Follow-up inspection needed')
    expect(fact(evidence, "Inspector's comment")).toHaveTextContent(
      'I need to see the new shelving in person.',
    )
  })

  it('AC 4.2: shows evidence waiting for review', async () => {
    openTicket('Replace the stained')

    const evidence = await screen.findByRole('region', { name: 'Your evidence' })
    expect(within(evidence).getByText('Replaced all cutting boards and added a sanitizer log.')).toBeInTheDocument()
    expect(fact(evidence, "Inspector's decision")).toHaveTextContent('Waiting for review')
    expect(fact(screen.getByRole('region', { name: 'Remediation' }), 'Status')).toHaveTextContent(
      'Awaiting review',
    )
  })

  it("AC 4.2: shows a completed follow-up inspection's comment", async () => {
    stubApi({ today: TODAY })
    signInAs('otherOwner')
    const { user } = renderApp('/my-store/tickets')
    await user.click(await screen.findByRole('link', { name: 'There is no sign of pests.' }))

    const followUps = await screen.findByRole('region', { name: 'Follow-up inspections' })
    expect(fact(followUps, 'Result')).toHaveTextContent('Issue fixed')
    expect(fact(followUps, "Inspector's comment")).toHaveTextContent('No flies seen; drain cleaned.')
    expect(fact(screen.getByRole('region', { name: 'Remediation' }), 'Status')).toHaveTextContent(
      /^Approved$/,
    )
  })

  it("AC 4.2 + 9.2: another store's ticket is not found", async () => {
    const api = stubApi({ today: TODAY })
    const corner = seededTicket(api.backend, 'Keep the dumpster lid')
    signInAs('owner')
    renderApp(`/my-store/tickets/${corner.id}`)

    expect(await screen.findByText('Ticket not found.')).toBeInTheDocument()
    expect(screen.queryByText(/Dumpster lid/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to my tickets' })).toHaveAttribute(
      'href',
      '/my-store/tickets',
    )
  })

  it('AC 4.2: a ticket id that is not a number is not found', async () => {
    stubApi({ today: TODAY })
    signInAs('owner')
    renderApp('/my-store/tickets/abc')

    expect(await screen.findByText('Ticket not found.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Ticket not found' })).toBeInTheDocument()
  })

  it('AC 4.2: a crafted id cannot point the request at another API path', async () => {
    const { fetch } = stubApi({ today: TODAY })
    signInAs('owner')
    // The router decodes %2F, so this id would otherwise resolve to /api/my-store.
    renderApp('/my-store/tickets/..%2F..%2Fmy-store')

    expect(await screen.findByText('Ticket not found.')).toBeInTheDocument()
    expect(requestsTo(fetch, '/api/my-store')).toHaveLength(0)
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/api/my-store/tickets'))).toBe(false)
  })

  it('AC 4.2: shows a loading message, then the ticket', async () => {
    let finish
    openTicket('Repair the cooler', {
      override: (method, path) =>
        path.startsWith('/api/my-store/tickets/') ? new Promise((resolve) => { finish = resolve }) : null,
    })

    expect(screen.getByText('Loading the ticket…')).toBeInTheDocument()
    expect(document.title).toBe('Remediation ticket')

    finish(null)
    // A null override falls through to the mock, which answers with the seeded ticket.
    expect(await screen.findByText(COOLER)).toBeInTheDocument()
    expect(screen.queryByText('Loading the ticket…')).not.toBeInTheDocument()
  })

  it('AC 4.2: offers a retry when the ticket fails to load', async () => {
    let failures = 1
    const { fetch, ticket, user } = openTicket('Repair the cooler', {
      override: (method, path) =>
        path.startsWith('/api/my-store/tickets/') && failures-- > 0
          ? new Response('', { status: 503 })
          : null,
    })

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(COOLER)).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load this ticket.", { exact: false })).not.toBeInTheDocument()
    expect(requestsTo(fetch, `/api/my-store/tickets/${ticket.id}`)).toHaveLength(2)
  })
})
